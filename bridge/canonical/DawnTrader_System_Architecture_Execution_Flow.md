# DawnTrader — System Architecture & Execution Flow Overview

**Document Created:** December 12, 2025  
**Last Updated:** February 6, 2026  
**Purpose:** Complete factual reference for system architecture, data flows, and execution cadences  
**Scope:** Phase 11 Production-Ready (through Directive 11.8B-D1)

> **Note (Phase 11.8B-D1):** Net Expectancy Kernel (`server/core/calculations/net-expectancy-kernel.ts`) is the sole authority for EV calculations. Phase 11 Predictive Learning is the sole authority for parameter adjustment. All parallel learning systems (LATTi, Goals ML, ARA, DHMA Tuning) have been decommissioned. `/api/filters-v2` is the sole write path for screener filters; `/api/screeners` returns 410 Gone. Database fields `tunedByLatti`, `managedByLottie`, `manualOverrideEnabled`, `filterOverrides` are FROZEN.

---

# Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Service Registry](#2-core-service-registry)
3. [Symbol Canonicalization Layer](#3-symbol-canonicalization-layer)
4. [Market Data & Pricing Infrastructure](#4-market-data--pricing-infrastructure)
5. [Scanning & Pool Architecture](#5-scanning--pool-architecture)
6. [Regime Detection & Strategy Selection](#6-regime-detection--strategy-selection)
7. [Signal Generation Pipeline](#7-signal-generation-pipeline)
8. [Virtual Trade Simulator (VTS)](#8-virtual-trade-simulator-vts)
9. [Ready-to-Buy (RTB) System](#9-ready-to-buy-rtb-system)
10. [Trade Execution Layer](#10-trade-execution-layer)
11. [Telemetry & Learning Infrastructure](#11-telemetry--learning-infrastructure)
12. [Central Clock & Timing Architecture](#12-central-clock--timing-architecture)
13. [WebSocket & Event Broadcasting](#13-websocket--event-broadcasting)
14. [Database Schema Summary](#14-database-schema-summary)

---

# 1. System Overview

DawnTrader is a **long-only, spot-trading cryptocurrency day trading platform** for the Kraken exchange. The system features autonomous learning, regime-adaptive strategy selection, and institutional-grade risk management.

## 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           DAWNTRADER V3.1 SYSTEM ARCHITECTURE (Phase 11)                          │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              MARKET DATA LAYER                                             │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐  │   │
│  │  │  Kraken REST    │    │ Kraken WebSocket│    │ Binance/CoinGecko│   │  OHLC Cache  │  │   │
│  │  │  (OHLC, Ticker) │    │ (Real-time Ticks)│   │   (Fallback)    │   │  (721 candles)│  │   │
│  │  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘   └──────┬───────┘  │   │
│  │           │                      │                      │                    │          │   │
│  │           └──────────────────────┼──────────────────────┼────────────────────┘          │   │
│  │                                  ▼                      │                               │   │
│  │                    ┌─────────────────────────────┐      │                               │   │
│  │                    │  Symbol Canonicalizer       │◀─────┘                               │   │
│  │                    │  (Kraken ↔ BASE/QUOTE)      │                                      │   │
│  │                    └─────────────┬───────────────┘                                      │   │
│  │                                  ▼                                                       │   │
│  │                    ┌─────────────────────────────┐                                      │   │
│  │                    │     Unified Price Cache     │                                      │   │
│  │                    │  (4 buckets, rate-limited)  │                                      │   │
│  │                    └─────────────────────────────┘                                      │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                        SCANNING & FILTERING LAYER                                         │   │
│  │                                                                                           │   │
│  │    ┌─────────────────────────┐         ┌─────────────────────────────────────────┐      │   │
│  │    │   FX5 Scanner (30s)     │────────▶│     Adaptive Scan Manager               │      │   │
│  │    │   • 100 pairs/cycle     │         │                                         │      │   │
│  │    │   • Dual-pool selection │         │  ┌─────────────────┐ ┌──────────────┐   │      │   │
│  │    │   • IMF metrics calc    │         │  │   Ideal Pool    │ │ Rotational   │   │      │   │
│  │    │                         │         │  │   (60% batch)   │ │ Pool (40%)   │   │      │   │
│  │    └─────────────────────────┘         │  │   Top telemetry │ │ Diversity    │   │      │   │
│  │                                        │  └─────────────────┘ └──────────────┘   │      │   │
│  │                                        └──────────────────────┬──────────────────┘      │   │
│  │                                                               │                          │   │
│  │    ┌─────────────────────────────────────────────────────────▼───────────────────┐      │   │
│  │    │                    IMF (Institutional Math Filters)                          │      │   │
│  │    │    LQ (Log-Liquidity) ≥ 40  │  VolNoise ≤ 0.6  │  DI ≥ 45  │  Sigma calc   │      │   │
│  │    └─────────────────────────────────────────────────────────────────────────────┘      │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                  │                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                       REGIME & STRATEGY LAYER                                             │   │
│  │                                                                                           │   │
│  │    ┌─────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │    │                   5-Class Regime Model (Z-Score Normalized)                      │  │   │
│  │    │                                                                                  │  │   │
│  │    │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ ┌──────────┐ │  │   │
│  │    │  │ BULL_STABLE │ │BEAR_VOLATILE│ │LOW_VOL_CHOP │ │HIGH_VOL_IMPULSE│ │TRANSITION│ │  │   │
│  │    │  │ mom>0.005   │ │ mom<-0.005  │ │ |mom|<0.002 │ │   mom>0.010   │ │  default │ │  │   │
│  │    │  │ adx>25      │ │ adx>25      │ │ adx<20      │ │   adx>30      │ │          │ │  │   │
│  │    │  │ vol<0.025   │ │ vol>0.03    │ │ vol<0.015   │ │   vol>0.03    │ │          │ │  │   │
│  │    │  └─────────────┘ └─────────────┘ └─────────────┘ └───────────────┘ └──────────┘ │  │   │
│  │    └─────────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                          │                                              │   │
│  │    ┌─────────────────────────────────────▼───────────────────────────────────────────┐  │   │
│  │    │              Dynamic Strategy Selector (DSS) - 17 Strategies                     │  │   │
│  │    │                                                                                  │  │   │
│  │    │  QUANT (8):     sma_trend_ride, vwap_pullback, breakout, mean_reversion,        │  │   │
│  │    │                 range_trade, momentum_surge, volatility_breakout, trend_follow   │  │   │
│  │    │                                                                                  │  │   │
│  │    │  PATTERN (5):   support_bounce, resistance_break, pivot_shift,                  │  │   │
│  │    │                 morning_star, engulfing_reversal                                 │  │   │
│  │    │                                                                                  │  │   │
│  │    │  HYBRID (4):    adaptive_flow, momentum_pattern, volatility_pattern,            │  │   │
│  │    │                 regime_switch                                                    │  │   │
│  │    └─────────────────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                  │                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                       SIGNAL GENERATION & VALIDATION LAYER                                │   │
│  │                                                                                           │   │
│  │    ┌──────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │    │                   Signal Orchestrator (30s cycle)                                 │  │   │
│  │    │                                                                                   │  │   │
│  │    │   For each pair in scan batch:                                                    │  │   │
│  │    │   ├── Calculate market regime (Z-Score normalized)                               │  │   │
│  │    │   ├── Check macro-state conditions                                               │  │   │
│  │    │   ├── Apply IMF thresholds (with macro adjustments)                              │  │   │
│  │    │   ├── Select compatible strategies via DSS                                       │  │   │
│  │    │   ├── Compute FinalScore (unified formula)                                       │  │   │
│  │    │   └── Validate profitability gate (NetEV > 0)                                    │  │   │
│  │    └───────────────────────────────────────┬──────────────────────────────────────────┘  │   │
│  │                                            │                                             │   │
│  │    ┌──────────────────┐    ┌──────────────▼──────────────┐    ┌─────────────────────┐   │   │
│  │    │ VTS (Passive)    │◀───│      Signal Queue Engine    │───▶│  RTB Refresh (15s)  │   │   │
│  │    │ Virtual trades   │    │   FinalScore + RegimeWeight │    │  8 buckets, ACT     │   │   │
│  │    │ Telemetry writes │    └─────────────────────────────┘    │  Adaptive concur.   │   │   │
│  │    └──────────────────┘                                       └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                  │                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                        EXECUTION & RISK LAYER                                             │   │
│  │                                                                                           │   │
│  │    ┌──────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │    │               Trade Safety Checks (8-Step Sequence)                               │  │   │
│  │    │                                                                                   │  │   │
│  │    │   1. Kill Switch ──────────────────────────────────────────────────────────────  │  │   │
│  │    │   2. Stop-Loss Required ───────────────────────────────────────────────────────  │  │   │
│  │    │   3. Stop-Loss Valid ──────────────────────────────────────────────────────────  │  │   │
│  │    │   4. Max 1 Position Per Asset ─────────────────────────────────────────────────  │  │   │
│  │    │   5. Symbol Cooldown ──────────────────────────────────────────────────────────  │  │   │
│  │    │   6. Position Size Cap ────────────────────────────────────────────────────────  │  │   │
│  │    │   7. LPCP Protection (Dormant) ────────────────────────────────────────────────  │  │   │
│  │    │   8. Max Open Trades ──────────────────────────────────────────────────────────  │  │   │
│  │    │                                                                                   │  │   │
│  │    │   Result: ✅ PASS → Execute  |  ❌ BLOCK → Log reason, skip                      │  │   │
│  │    └───────────────────────────────┬──────────────────────────────────────────────────┘  │   │
│  │                                    │                                                     │   │
│  │    ┌───────────────────────────────▼──────────────────────────────────────────────────┐  │   │
│  │    │               Paper/Live Execution Engine (1.5s monitoring)                       │  │   │
│  │    │                                                                                   │  │   │
│  │    │   ENTRY:                           EXIT MONITORING:                               │  │   │
│  │    │   • Apply entry slippage (0.15%)   • Fetch live price (Price Cache)              │  │   │
│  │    │   • Apply entry fee (0.10%)        • Check adaptive trailing stop                 │  │   │
│  │    │   • Create trade record            • Check take-profit trigger                    │  │   │
│  │    │   • Subscribe price updates        • Apply exit slippage + fees                   │  │   │
│  │    │                                    • Calculate P/L (gross, net)                   │  │   │
│  │    └──────────────────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          LEARNING & TELEMETRY LAYER                                       │   │
│  │                                                                                           │   │
│  │    ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐                   │   │
│  │    │ Telemetry Aggr.   │  │ ML Calibration    │  │ Adaptive Ratio    │                   │   │
│  │    │ 24h rolling data  │  │ Service           │  │ Manager           │                   │   │
│  │    │ Per-pair metrics  │  │ Performance score │  │ Ideal/Rotational  │                   │   │
│  │    └───────────────────┘  └───────────────────┘  └───────────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 2. Core Service Registry

## 2.1 Primary Services

| Service | File | Purpose |
|---------|------|---------|
| **KrakenService** | `server/services/kraken.ts` | Exchange API integration (REST + WebSocket) |
| **FX5 Scanner** | `server/services/fx5-scanner.ts` | Market scanning, 100 pairs/cycle |
| **Signal Orchestrator** | `server/services/signal-orchestrator.ts` | Strategy evaluation, signal generation |
| **Strategy Engine** | `server/services/strategy-engine.ts` | 17 strategy implementations |
| **Paper Execution Engine** | `server/services/paper-execution-engine.ts` | Paper trade execution & monitoring |
| **VTS Runner** | `server/services/vts-runner.ts` | Virtual Trade Simulator cycles |
| **VTS Service** | `server/services/vts-service.ts` | VTS coordination & lifecycle |

## 2.2 Infrastructure Services

| Service | File | Purpose |
|---------|------|---------|
| **Price Cache** | `server/services/price-cache.ts` | Unified rate-governed cache (4 buckets) |
| **RTB Refresh Service** | `server/services/rtb-refresh-service.ts` | Ready-to-Buy signal refresh (15s/bucket) |
| **Telemetry Aggregator** | `server/services/telemetry-aggregator.ts` | 24h rolling performance metrics |
| **Adaptive Scan Manager** | `server/services/adaptive-scan-manager.ts` | Dual-pool pair selection |
| **Adaptive Ratio Manager** | `server/services/adaptive-ratio-manager.ts` | Ideal/Rotational pool ratios |
| **Central Clock** | `server/services/central-clock.ts` | Synchronized 1-second ticks |
| **Context Bridge** | `server/services/context-bridge.ts` | WebSocket event broadcasting |

## 2.3 Metrics & Analysis Services

| Service | File | Purpose |
|---------|------|---------|
| **Market Regime** | `server/core/metrics/market-regime.ts` | 5-class regime detection + Z-Score |
| **Macro-State** | `server/core/metrics/macro-state.ts` | Global market condition detection |
| **IMF Metrics** | `server/core/metrics/imf-metrics.ts` | LQ, VolNoise, DI, Sigma calculations |
| **Expectancy** | `server/core/calculations/expectancy.ts` | Profitability gate validation |
| **ML Calibration** | `server/services/ml-calibration.ts` | Performance-based learning |

---

# 3. Symbol Canonicalization Layer

## 3.1 Purpose

The Symbol Canonicalizer ensures consistent symbol naming across all subsystems, translating between Kraken's exchange format and the canonical BASE/QUOTE format.

**File:** `server/services/utils/symbol-canonicalizer.ts`

## 3.2 Symbol Format Translation

| Kraken Format | Canonical Format | Notes |
|---------------|------------------|-------|
| `XXBTZUSD` | `BTC/USD` | X prefix, Z quote prefix |
| `XETHZUSD` | `ETH/USD` | X prefix on base |
| `SOLUSD` | `SOL/USD` | No prefix (newer listings) |
| `XXDGZUSD` | `DOGE/USD` | XDG = DOGE |

## 3.3 Key Functions

```typescript
toCanonical(exchangeId: string): string    // XXBTZUSD → BTC/USD
toKrakenId(canonical: string): string      // BTC/USD → XXBTZUSD
```

## 3.4 Integration Points

All subsystems **must** use canonical format internally:
- Whitelist/Blacklist configurations
- Screener filters
- Guardrails settings
- Strategy pre-checks
- MarketDataCoordinator
- Telemetry storage
- WebSocket broadcasts

---

# 4. Market Data & Pricing Infrastructure

## 4.1 Unified Price Cache

**File:** `server/services/price-cache.ts`

The Price Cache is the **single source of truth** for all price data, consolidating multiple sources with rate limiting.

### 4.1.1 Cache Buckets

| Bucket | Refresh Interval | Purpose |
|--------|------------------|---------|
| `openTrade` | 2 seconds | Active position monitoring |
| `readyToBuy` | 15 seconds | RTB signal refresh |
| `fx5Snapshot` | 30 seconds | Scanner price data |
| `vtsSimulation` | 60 seconds | VTS simulation cache (isolated) |

### 4.1.2 Rate Limiting

- **Max Weight:** 10 weighted requests/second
- **Batch Size:** 100 symbols per batch
- **Cooldown:** Token-bucket with per-symbol tracking

### 4.1.3 Price Entry Structure

```typescript
interface CachedPrice {
  symbol: string;
  price: number;
  ask: number;
  bid: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastSource: 'kraken_ws' | 'kraken_rest';
  lastUpdatedAt: number;
}
```

## 4.2 OHLC Cache

**File:** `server/core/cache/ohlc-cache.ts` (crypto) + `server/services/xstock-ohlc-cache.ts` (xstock, asset-class-scoped — B-NEW-34, 2026-05-15)

- 721 candles per symbol on the crypto path (60-minute intervals; 1-hour candles = ~30 days of swing-tradable history)
- xstock path: 60 candles per symbol at 60-min, optional 30 candles at 240-min — B-NEW-34 (locally aggregated from `xstock_spot_ohlc_1m` archive because Kraken has no equities REST API)
- Both cache instances: TTL-based refresh (5 minutes)
- Lazy-loaded on first request
- Used for IMF calculations and regime detection
- **Note (2026-05-15):** previous wording "5-minute intervals = ~2.5 days" was doc drift; the canonical bar interval has always been 60 minutes (1-hour swing-trading cadence). B-NEW-34 promoted the same 60-minute bar contract to xstock_spot and corrected this doc.

## 4.3 Data Source Hierarchy

1. **Kraken WebSocket** - Real-time ticks (primary)
2. **Kraken REST** - Fallback with rate limiting
3. **Binance API** - External fallback
4. **CoinGecko API** - Secondary external fallback

---

# 5. Scanning & Pool Architecture

## 5.1 FX5 Scanner

**File:** `server/services/fx5-scanner.ts`

The FX5 Scanner runs every 30 seconds, scanning 100 pairs per cycle using dual-pool selection.

### 5.1.1 Scan Flow

```
1. Load trading mode (paper/live)
2. Check passive learning state
3. Call AdaptiveScanManager.getBatch()
4. For each pair:
   ├── Calculate IMF metrics (LQ, VolNoise, DI, Sigma)
   ├── Determine market regime
   ├── Apply filter thresholds
   └── Classify as survivor or filtered
5. Update Stage-3 cache
6. Broadcast scan_tick event
7. If engine stopped: Trigger VTS cycle
```

### 5.1.2 IMF (Institutional Math Filters)

| Metric | Threshold | Formula |
|--------|-----------|---------|
| **LQ (Log-Liquidity)** | ≥ 40 | `log10(volume24h × price) × 10` |
| **VolNoise** | ≤ 0.6 | Volatility-to-trend ratio |
| **DI (Directional Integrity)** | ≥ 45 | Trend strength indicator |
| **Sigma (σ)** | Calculated | Standard deviation of returns |

## 5.2 Adaptive Scan Manager

**File:** `server/services/adaptive-scan-manager.ts`

Manages dual-pool pair selection for learning-driven scanning.

### 5.2.1 Pool Architecture

| Pool | Allocation | Selection Criteria |
|------|------------|-------------------|
| **Ideal Pool** | 60% (54-60 pairs) | Top telemetry scores, proven performers |
| **Rotational Pool** | 40% (40-46 pairs) | Diversity sampling, exploration |

### 5.2.2 Pair Failure Tracking

- Cooldown blacklist for consistently failing pairs
- TTL-based expiry (configurable)
- Automatic removal after performance recovery

## 5.3 Adaptive Ratio Manager

**File:** `server/services/adaptive-ratio-manager.ts`

Dynamically adjusts Ideal/Rotational split based on market conditions and pool performance.

```
Ratio = f(regime, idealWinRate, rotationalWinRate, confidence)
Default: 60% Ideal / 40% Rotational
Range: 50-70% Ideal / 30-50% Rotational
```

---

# 6. Regime Detection & Strategy Selection

## 6.1 5-Class Market Regime Model

**File:** `server/core/metrics/market-regime.ts`

### 6.1.1 Regime Definitions

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| **BULL_STABLE** | > 0.005 | > 25 | < 0.025 | Sustained uptrend, low volatility |
| **BEAR_VOLATILE** | < -0.005 | > 25 | > 0.03 | Downtrend with high turbulence |
| **LOW_VOL_CHOP** | |mom| < 0.002 | < 20 | < 0.015 | Range-bound, no direction |
| **HIGH_VOL_IMPULSE** | > 0.010 | > 30 | > 0.03 | Breakout with violent expansion |
| **TRANSITION** | ±0.004 | 20-25 | 0.015-0.03 | Reversal zone, weakening trend |

### 6.1.2 Z-Score Normalization

**File:** `server/utils/rolling-stats.ts`

- 300-period rolling window for statistics
- Z-Score calculation: `(value - mean) / stdDev`
- 30-sample warmup requirement before valid classification
- Adaptive thresholds based on historical distribution

```typescript
getNormalizedRegime(pair: string): {
  regime: CanonicalRegimeType;
  zScores: { momentum: number; volatility: number; adx: number };
  confidence: number;
}
```

## 6.2 Macro-State Detection

**File:** `server/core/metrics/macro-state.ts`

Global market condition detection affecting all pairs.

### 6.2.1 Macro Conditions

Uses rolling Z-scores of aggregate market metrics (300-period window, 30-sample warmup):

| Condition | Z-Score Detection | IMF Adjustments |
|-----------|-------------------|-----------------|
| **NORMAL** | Default (no thresholds exceeded) | Standard thresholds |
| **VOLATILITY_EXPANSION** | avgVolatilityZ > 2 | LQ × 1.2, VolNoise × 0.8 |
| **LIQUIDITY_CRUNCH** | liquidityZ < -1 | LQ × 1.5 |
| **SPECULATIVE_SURGE** | correlationZ > 1.5 | LQ × 1.1, VolNoise × 0.7 |

### 6.2.2 Threshold Adjustment

**File:** `server/core/metrics/secondary-metrics.ts`

```typescript
adjustMetricRanges(macro: MacroCondition): {
  lqMultiplier: number;
  volNoiseMultiplier: number;
}
```

## 6.3 Dynamic Strategy Selector (DSS)

**File:** `server/services/dynamic-strategy-selector.ts`

Selects compatible strategies based on current regime.

### 6.3.1 Strategy Catalog (17 Strategies)

**QUANT Strategies (8):**
| Strategy | Regime Affinity | Secondary Metrics |
|----------|-----------------|-------------------|
| `sma_trend_ride` | BULL_STABLE, HIGH_VOL_IMPULSE | ADX > 25 required |
| `vwap_pullback` | BULL_STABLE | VWAP proximity |
| `breakout` | HIGH_VOL_IMPULSE | Volume confirmation |
| `mean_reversion` | LOW_VOL_CHOP | Bollinger width |
| `range_trade` | LOW_VOL_CHOP | Support/resistance |
| `momentum_surge` | HIGH_VOL_IMPULSE | RSI, momentum |
| `volatility_breakout` | HIGH_VOL_IMPULSE | ATR expansion |
| `trend_follow` | BULL_STABLE | EMA alignment |

**PATTERN Strategies (5):**
| Strategy | Pattern Types | Regime Affinity |
|----------|---------------|-----------------|
| `support_bounce` | PINBAR, ENGULFING | LOW_VOL_CHOP |
| `resistance_break` | ENGULFING | HIGH_VOL_IMPULSE |
| `pivot_shift` | MORNING_STAR | TRANSITION |
| `morning_star` | MORNING_STAR | BEAR_VOLATILE (reversal) |
| `engulfing_reversal` | ENGULFING | Any |

**HYBRID Strategies (4):**
| Strategy | Description | Regime Affinity |
|----------|-------------|-----------------|
| `adaptive_flow` | Quant + Pattern ensemble | All |
| `momentum_pattern` | Momentum with pattern confirmation | BULL_STABLE |
| `volatility_pattern` | Volatility breakout + patterns | HIGH_VOL_IMPULSE |
| `regime_switch` | Cross-regime transitions | TRANSITION |

## 6.4 Canonical Regime-Strategy Map

**File:** `server/config/canonical-regime-strategy-map.ts`

Single source of truth for all regime/strategy/signal type/pattern mappings.

```typescript
interface RegimeStrategyMapping {
  metrics: RegimeMetrics;
  strategies: StrategyDefinition[];
  riskMultiplier: number;
  minConfidence: number;
}
```

---

# 7. Signal Generation Pipeline

## 7.1 Signal Orchestrator

**File:** `server/services/signal-orchestrator.ts`

Runs every 30 seconds, evaluating all pairs in the scan batch.

### 7.1.1 Signal Flow

```
1. Get scan batch from FX5 Scanner
2. For each pair:
   ├── Fetch OHLC history (721 candles)
   ├── Calculate indicators (RSI, MACD, Bollinger, etc.)
   ├── Determine market regime (Z-Score normalized)
   ├── Check macro-state conditions
   ├── Select compatible strategies via DSS
   ├── Evaluate each strategy
   ├── Calculate FinalScore
   ├── Validate profitability gate
   └── Generate signal if passing
3. Route signals to RTB queue
4. Record telemetry
```

### 7.1.2 FinalScore Calculation

**Unified formula across all subsystems:**

```
FinalScore = (
  confidence × 0.35 +
  regimeWeight × 0.25 +
  liquidityScore × 0.20 +
  momentumScore × 0.15 +
  patternScore × 0.05
) × riskAdjustment
```

**Coefficients are immutable** and defined in `server/utils/final-score-calculator.ts`.

### 7.1.3 Profitability Gate

**File:** `server/core/calculations/expectancy.ts`

Every signal must pass the Net Expectancy Value (NetEV) check:

```typescript
isMathematicallyProfitable(signal: Signal): boolean {
  const grossProfit = (targetPrice - entryPrice) / entryPrice;
  const totalCost = (feeRate × 2) + (spread × 1.1) + slippage;
  return grossProfit > totalCost;
}
```

---

# 8. Virtual Trade Simulator (VTS)

## 8.1 Purpose

VTS generates virtual trades during passive learning mode, feeding telemetry without affecting real/paper trading.

**Files:**
- `server/services/vts-runner.ts` - Simulation cycle execution
- `server/services/vts-service.ts` - VTS coordination

## 8.2 VTS Architecture

```
VTS operates when trading engine is STOPPED:
├── Triggered by FX5 Scanner completion
├── Uses isolated cache bucket (vtsSimulation)
├── 60-second simulation cycles
├── 100 pairs from Ideal Pool
├── Generates virtual trades with full cost modeling
└── Writes to telemetry (not trade tables)
```

## 8.3 VTS Flow

```
1. FX5 scan completes → triggers VTS cycle
2. Get 29 pairs from FX5 batch (raw data, no telemetry query)
3. For each pair:
   ├── Calculate market regime (with Z-Score logging)
   ├── Select strategy via DSS
   ├── Compute FinalScore
   ├── Check strategy-specific guardrails (e.g., ADX>25 for sma_trend_ride)
   ├── Validate profitability gate
   └── Open virtual trade if passing
4. Record to telemetry_pairs table
5. Update pool statistics (ideal/rotational win rates)
```

## 8.4 Data Segregation

VTS data is completely isolated:
- Uses `vtsSimulation` cache bucket
- Writes to telemetry tables only
- Never affects paper_sim_trades or live_trades
- Tagged with `source: 'simulation'`

---

# 9. Ready-to-Buy (RTB) System

## 9.1 RTB Architecture

### 9.1.1 Ready-to-Buy Service

**File:** `server/core/rtb/ready_to_buy_service.ts`

Central queue for trade-ready signals awaiting execution.

### 9.1.2 RTB Refresh Service

**File:** `server/services/rtb-refresh-service.ts`

Bucket-based signal refresh with adaptive concurrency.

## 9.2 Refresh Architecture

| Property | Value |
|----------|-------|
| **Micro-cycle** | 15 seconds (one bucket refresh) |
| **Macro-cycle** | 120 seconds (full coverage of 8 buckets) |
| **Buckets** | 8 rotating buckets |
| **Concurrency** | Adaptive pool (3-10 workers) |

### 9.2.1 Adaptive Concurrency Tuner (ACT)

```
Scale UP: avgCpu < 55% AND avgDuration < 5000ms
Scale DOWN: avgCpu > 60% OR avgDuration > 8000ms
Lag Protection: eventLoopLag > 2ms → force reduction
```

### 9.2.2 Bucket Optimization

- 85% cycle duration reduction via bucketing
- All pricing from unified Price Cache (no direct Kraken calls)
- Central Clock synchronized timing

## 9.3 Signal Lifecycle

```
Signal Orchestrator → SQE (FinalScore filter) → RTB Queue
    ↓
TCL (Trade Criteria Limiter) promotion
    ↓
TEC (Trade Execution Controller)
    ↓
Order Management
```

---

# 10. Trade Execution Layer

## 10.1 Paper Execution Engine

**File:** `server/services/paper-execution-engine.ts`

### 10.1.1 Entry Processing

```
1. Receive signal from RTB queue
2. Run 8-step safety checks
3. If PASS:
   ├── Apply entry slippage (0.15%)
   ├── Apply entry fee (0.10%)
   ├── Calculate position size
   ├── Create paper_sim_trades record
   ├── Create paper_sim_open_positions record
   └── Subscribe to price updates
```

### 10.1.2 Exit Monitoring (1.5s cycle)

```
For each open position:
├── Fetch live price from Price Cache
├── Check adaptive trailing stop
├── Check take-profit trigger
├── If exit triggered:
│   ├── Apply exit slippage (0.15%)
│   ├── Apply exit fee (0.10%)
│   ├── Calculate gross P/L
│   ├── Calculate net P/L
│   ├── Update paper_sim_trades (status='closed')
│   ├── Delete paper_sim_open_positions
│   └── Update paper_sim_portfolio balance
```

## 10.2 Trade Safety Checks

**File:** `server/services/trade-safety.ts`

| Step | Check | Blocking Condition |
|------|-------|-------------------|
| 1 | Kill Switch | `killSwitchTripped = true` |
| 2 | Stop-Loss Required | Missing stop-loss price |
| 3 | Stop-Loss Valid | SL > entry price or < 0 |
| 4 | Max Per Asset | Already holding this symbol |
| 5 | Symbol Cooldown | Recent trade on symbol |
| 6 | Position Size Cap | Exceeds max position % |
| 7 | LPCP Protection | Low-probability override (dormant) |
| 8 | Max Open Trades | At max positions limit |

## 10.3 Adaptive Trailing Exit

**File:** `server/services/trailing-exit-controller.ts`

Dynamic stop distance based on market conditions:

```
stopDistance = baseDistance × (1 + volatilityFactor × regime.volatility)
```

Two-stage latching:
1. **Lock-in stage:** Once profit exceeds threshold, trailing activates
2. **Trail stage:** Stop follows price with dynamic distance

---

# 11. Telemetry & Learning Infrastructure

## 11.1 Telemetry Aggregator

**File:** `server/services/telemetry-aggregator.ts`

### 11.1.1 Data Collection

- 24-hour rolling window per pair
- Win rate, average P/L, trade count
- Strategy-specific performance metrics
- Regime-tagged outcomes

### 11.1.2 Pool Metrics

```typescript
interface PoolMetrics {
  pool: 'ideal' | 'rotational';
  winRate: number;
  samples: number;
  avgFinalScore: number;
  lastUpdated: Date;
}
```

## 11.2 ML Calibration Service

**File:** `server/services/ml-calibration.ts`

Performance-based learning with edge delta tracking.

### 11.2.1 Performance Score Formula

```
performanceScore = 
  winRate × 0.4 +
  avgNetPL × 0.3 +
  consistency × 0.2 +
  regimeAlignment × 0.1
```

### 11.2.2 Learning Feedback

- Tracks edge delta (expected vs actual performance)
- Generates adjustment recommendations
- Per-strategy calibration targets

## 11.3 Strategy Analyzer

**File:** `server/core/strategy-analyzer.ts`

Per-strategy performance audit:

```typescript
auditStrategyPerformance(): {
  strategy: string;
  winRate: number;
  sampleSize: number;
  recommendation: 'keep' | 'monitor' | 'disable';
}[]
```

---

# 12. Central Clock & Timing Architecture

## 12.1 Central Clock Service

**File:** `server/services/central-clock.ts`

Provides synchronized 1-second ticks for all subsystems.

### 12.1.1 Clock Tick Structure

```typescript
interface ClockTick {
  timestamp: number;
  tickNumber: number;
  drift: number;
}
```

### 12.1.2 Subscribers

| Subsystem | Tick Modulo | Purpose |
|-----------|-------------|---------|
| FX5 Scanner | 30 | Market scanning |
| Signal Orchestrator | 30 | Strategy evaluation |
| RTB Refresh | 15 | Bucket refresh |
| Position Monitor | 1.5 | SL/TP checking |
| Health Monitor | 5 | System health |

## 12.2 Timing Summary

| Cycle | Interval | File |
|-------|----------|------|
| Central Clock tick | 1,000 ms | `central-clock.ts` |
| Position Monitoring | 1,500 ms | `paper-execution-engine.ts` |
| RTB Bucket Refresh | 15,000 ms | `rtb-refresh-service.ts` |
| FX5 Scanner | 30,000 ms | `fx5-scanner.ts` |
| Signal Orchestrator | 30,000 ms | `signal-orchestrator.ts` |
| VTS Simulation | 60,000 ms | `vts-runner.ts` |
| RTB Full Coverage | 120,000 ms | 8 buckets × 15s |
| Pool TTL | 300,000 ms | `active-filter-pool.ts` |

---

# 13. WebSocket & Event Broadcasting

## 13.1 Context Bridge

**File:** `server/services/context-bridge.ts`

Central WebSocket event broadcaster.

### 13.1.1 Event Types

| Event | Payload | Trigger |
|-------|---------|---------|
| `scan_tick` | Scan metrics | FX5 cycle complete |
| `price_updated` | Price data | Price Cache refresh |
| `health_engine` | Health status | 5s heartbeat |
| `trade_event` | Trade details | Entry/exit |
| `portfolio_update` | Balance | Trade close |
| `scanner:breakdown` | Filter stats | Scan complete |

### 13.1.2 Mode Isolation

Events are tagged with mode (paper/live) for client filtering.

## 13.2 Kraken WebSocket Adapter

**File:** `server/services/kraken-websocket-adapter.ts`

- Real-time ticker subscriptions
- Automatic reconnection
- 5-second subscription audit
- Rate-limit compliance

---

# 14. Database Schema Summary

## 14.1 Trading Tables

| Table | Purpose |
|-------|---------|
| `paper_sim_trades` | All paper trades (open + closed) |
| `paper_sim_open_positions` | Currently open paper positions |
| `paper_sim_portfolio` | Paper portfolio balance |
| `live_trades` | Live trade records |
| `live_open_positions` | Live open positions |

## 14.2 Configuration Tables

| Table | Purpose |
|-------|---------|
| `guardrails_v2` | Risk parameters per mode |
| `screener_filters` | Filter configuration |
| `users` | User authentication |

## 14.3 Telemetry Tables

| Table | Purpose |
|-------|---------|
| `telemetry_pairs` | Per-pair rolling metrics |
| `telemetry_strategies` | Per-strategy performance |
| `execution_attempt_audit` | RTB attempt logs |

## 14.4 Analysis Tables

| Table | Purpose |
|-------|---------|
| `imf_metrics` | IMF calculation results |
| `regime_history` | Regime detection log |
| `signal_history` | Signal generation log |

---

# Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-12 | 1.0 | Initial creation (Phase 8.8.3) |
| 2025-12-20 | 1.1 | Phase 8.8.4 validation framework |
| 2026-01-08 | 1.2 | Phase 9-10 additions |
| 2026-01-18 | 2.0 | Complete overhaul for Phase 11 |
| 2026-02-05 | 3.0 | Phase 11.6-11.8C: Data purge, regime archive, authority unification, legacy decommission |

---

# Recent Directives Summary (Phase 11.6-11.8)

| Directive | Purpose | Status |
|-----------|---------|--------|
| 11.6A | Data Purge & ML Reset | ✅ Complete |
| 11.6D | VTS Exit Logic Fix | ✅ Complete |
| 11.7E | Regime Archive System | ✅ Complete |
| 11.7F | Canonical Regime & Strategy Lock-In | ✅ Complete |
| 11.8A | Predictive & Learning Authority Audit | ✅ Complete |
| 11.8B | LATTi/Parallel Systems Decommission | ✅ Complete |
| 11.8C | Purpose Tab & Preset Decommission | ✅ Complete |

## Authority Model (Post-11.8)

| Authority | Resource | Role |
|-----------|----------|------|
| Net Expectancy Kernel | `server/core/calculations/net-expectancy-kernel.ts` | Sole EV calculation authority |
| Phase 11 Predictive Learning | `server/core/calibration/*` | Sole parameter adjustment authority |
| Canonical Regime Map | `server/config/canonical-regime-strategy-map.ts` | Sole regime-strategy mapping source |

## Strategy Realignment (Directive 11.7F)

| Strategy | Previous Regime | New Regime |
|----------|-----------------|------------|
| SMA Trend Ride | BULL_STABLE | HIGH_VOL_IMPULSE |
| Range Trading | (confirmed) | LOW_VOL_CHOP |

---

*This document serves as the authoritative technical reference for DawnTrader system architecture. All subsystems must align with the specifications documented here.*
