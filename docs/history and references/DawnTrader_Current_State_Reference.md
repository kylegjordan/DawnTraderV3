# DawnTrader V3: Current State Reference Document
## Paper Trading Engine Architecture, Strategies, Guardrails & System Components

**Document Created:** December 12, 2025  
**Purpose:** Comprehensive reference for the paper trading engine and all configurable components  
**Current Status:** Phase 8.8.3 (Trading Pipeline Functional)

---

# Table of Contents

**Part I: Paper Trading Engine Architecture**
1. [Paper Trading Engine Overview](#1-paper-trading-engine-overview)
2. [FX5 Scanner](#2-fx5-scanner)
3. [Active Filter Pool](#3-active-filter-pool)
4. [Signal Orchestrator](#4-signal-orchestrator)
5. [Strategy Engine](#5-strategy-engine)
6. [Position Sizing Helper](#6-position-sizing-helper)
7. [Trade Safety & Guardrail Checks](#7-trade-safety--guardrail-checks)
8. [Paper Execution Engine](#8-paper-execution-engine)
9. [Live Pricing & WebSocket](#9-live-pricing--websocket)
10. [Cycle Times & Cadences](#10-cycle-times--cadences)

**Part II: UI Tabs & Tracking System**
11. [Filter Insights Tab](#11-filter-insights-tab)
12. [Ready to Buy Tab](#12-ready-to-buy-tab)
13. [Open Trades Tab](#13-open-trades-tab)
14. [Trade History Tab](#14-trade-history-tab)

**Part III: Trading Strategies**
15. [Strategy Catalog](#15-strategy-catalog)

**Part IV: Configuration Components**
16. [Guardrails System](#16-guardrails-system)
17. [LPCP Module](#17-lpcp-module)
18. [Screener Filters](#18-screener-filters)
19. [Coherency Rules](#19-coherency-rules)
20. [Goals Presets](#20-goals-presets)
21. [LATTi vs Manual Control](#21-latti-vs-manual-control)

**Part V: Phase 11 Live Mode Transition**
22. [Live Mode Implementation Plan](#22-live-mode-implementation-plan)

---

# PART I: PAPER TRADING ENGINE ARCHITECTURE

---

# 1. Paper Trading Engine Overview

## 1.1 What Is Paper Trading?

The paper trading engine simulates real cryptocurrency trades **without using real money**. It:
- Uses real-time market prices from Kraken
- Simulates order execution with realistic slippage (0.15%) and fees (0.10%)
- Tracks a simulated portfolio balance starting at a user-defined amount
- Records all trades to a database for performance analysis

**Purpose:** Validate trading strategies and system behavior before risking real capital in Phase 11 (Live Mode).

**Starting Balance:** User-configurable (set when initializing paper trading session).

## 1.2 Engine Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAPER TRADING ENGINE FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐         │
│  │   KRAKEN    │───▶│   FX5 SCANNER    │───▶│  ACTIVE FILTER POOL │         │
│  │  MARKET     │    │   (30s cycle)    │    │   (5-min TTL)       │         │
│  │   DATA      │    │                  │    │                     │         │
│  └─────────────┘    │  • Fetches 60    │    │  • Deduped pairs    │         │
│                     │    pairs/batch   │    │  • Survivors only   │         │
│                     │  • Applies all   │    │  • Mode-isolated    │         │
│                     │    filters       │    │                     │         │
│                     └──────────────────┘    └─────────┬───────────┘         │
│                                                       │                      │
│                                                       ▼                      │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      SIGNAL ORCHESTRATOR (30s cycle)                  │   │
│  │                                                                       │   │
│  │   For each symbol in Active Pool:                                     │   │
│  │   ├── Fetch price history & indicators                                │   │
│  │   ├── Evaluate ALL 9 strategies via Strategy Engine                  │   │
│  │   ├── Filter by confidence threshold (default 60%)                   │   │
│  │   ├── Size positions via Sizing Helper                               │   │
│  │   └── Forward winning signals to Execution Engine                    │   │
│  └───────────────────────────────────┬──────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     TRADE SAFETY CHECKS (8-step sequence)             │   │
│  │                                                                       │   │
│  │   1. Kill Switch        5. Symbol Cooldown                           │   │
│  │   2. Stop-Loss Required 6. Position Size Cap                         │   │
│  │   3. Stop-Loss Valid    7. LPCP Protection (dormant)                 │   │
│  │   4. Max Per Asset      8. Max Open Trades                           │   │
│  │                                                                       │   │
│  │   Result: ✅ PASS → Execute  |  ❌ BLOCK → Log reason, skip trade    │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                          │
│                                  ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    PAPER EXECUTION ENGINE                             │   │
│  │                                                                       │   │
│  │   ENTRY:                          EXIT (1.5s monitoring cycle):      │   │
│  │   • Apply 0.15% slippage          • Fetch live price via WebSocket   │   │
│  │   • Apply 0.10% entry fee         • Check stop-loss trigger          │   │
│  │   • Create trade record           • Check take-profit trigger        │   │
│  │   • Create open position          • Apply exit slippage + fees       │   │
│  │   • Subscribe to WebSocket        • Calculate P/L (gross, net)       │   │
│  │                                   • Close position, update balance   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         DATABASE TABLES                               │   │
│  │                                                                       │   │
│  │   paper_sim_trades        - All executed trades (open + closed)      │   │
│  │   paper_sim_open_positions - Currently open positions                │   │
│  │   paper_sim_portfolio     - Portfolio balance tracking               │   │
│  │   execution_attempt_audit - All RTB attempts (success + blocked)     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.3 Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `SLIPPAGE_PERCENT` | 0.15% | `paper-execution-engine.ts` |
| `FEE_PERCENT` | 0.10% | `paper-execution-engine.ts` |
| `STARTING_BALANCE` | User-defined | `paper-sim-service.ts` |
| `FX5_SCAN_INTERVAL` | 30 seconds | `fx5-scanner.ts` |
| `SIGNAL_EVAL_INTERVAL` | 30 seconds | `signal-orchestrator.ts` |
| `MONITOR_INTERVAL` | 1.5 seconds | `paper-execution-engine.ts` |
| `POOL_TTL` | 5 minutes | `active-filter-pool.ts` |
| `RTB_TTL` | 30 seconds | `paper-execution-engine.ts` |

---

# 2. FX5 Scanner

## 2.1 Purpose

The FX5 Scanner is the **market data ingestion layer**. It runs continuously every 30 seconds, scanning the Kraken market for tradeable cryptocurrency pairs that meet the configured filter criteria.

## 2.2 Architecture

**File:** `server/services/fx5-scanner.ts`

```
FX5 Scanner (Always-On, 30-Second Interval)
├── Independent of trading engine state
├── Mode-isolated (paper + live run separately)
├── Uses batch-first architecture (60 pairs per scan)
│   ├── Top-N pairs (volume-ranked)
│   └── Tier-B rotation (diversity sampling)
├── Applies all screener filters
├── Outputs "survivors" to Active Filter Pool
└── Updates Stage-3 cache for UI consumption
```

## 2.3 Scan Flow

1. **Load Filters:** Fetch `screener_filters` for current mode
2. **Collect Batch:** Call `collectMixedBatch()` from market-scanner.ts
   - Fetches 60 pairs: Top-N by volume + Tier-B rotation
3. **Apply Filters:** Each pair tested against all configured filters
   - Price range, volume, liquidity, spread, volatility, RSI, etc.
4. **Identify Survivors:** Pairs that pass ALL filters
5. **Update Pool:** Add survivors to Active Filter Pool (5-min TTL)
6. **Emit Events:** Broadcast results via WebSocket for UI updates
7. **Track 24h Window:** Record scan metrics for historical analysis

## 2.4 Passive Learning Mode

When `passiveLearning = true` in screener filters:
- FX5 Scanner still runs and evaluates pairs
- BUT survivors are NOT added to Active Filter Pool
- Pool stays empty → no signals generated → no trades executed
- Purpose: Observe market data without trading

---

# 3. Active Filter Pool

## 3.1 Purpose

The Active Filter Pool maintains a **deduped, non-expired list** of cryptocurrency pairs that passed FX5 filters. It serves as the "universe" of tradeable symbols for the Signal Orchestrator.

## 3.2 Architecture

**File:** `server/services/active-filter-pool.ts`

| Property | Value |
|----------|-------|
| **Storage** | In-memory Map (per mode) |
| **TTL** | 5 minutes |
| **Deduplication** | Yes (skip if already in pool and not expired) |
| **Mode Isolation** | Yes (separate pools for paper/live) |

## 3.3 Pool Entry Structure

```typescript
interface ActiveFilteredPair {
  symbol: string;           // e.g., "BTC/USD"
  price: number;            // Current price when added
  volume24h: number;        // 24-hour volume
  dailyRange: number;       // Daily price range %
  firstSeen: string;        // ISO timestamp when first added
  lastUpdated: string;      // ISO timestamp when last seen
  expiresAt: number;        // Unix timestamp for TTL expiry
  source: 'paper' | 'live'; // Trading mode
}
```

## 3.4 Pool Operations

| Operation | Description |
|-----------|-------------|
| `addSurvivors()` | Add new pairs from FX5 scan (respects TTL, dedupes) |
| `getSurvivors()` | Get all non-expired pairs for signal evaluation |
| `removeExpiredEntries()` | Cleanup expired entries (called on each add) |
| `clearPool()` | Reset entire pool (used during hard reset) |

---

# 4. Signal Orchestrator

## 4.1 Purpose

The Signal Orchestrator is the **strategy evaluation layer**. It takes symbols from the Active Filter Pool and evaluates all 9 trading strategies to generate buy signals.

## 4.2 Architecture

**File:** `server/services/signal-orchestrator.ts`

```
Signal Orchestrator (30-Second Evaluation Cycle)
├── Loads symbols from Active Filter Pool
├── For each symbol:
│   ├── Fetch price history from Kraken
│   ├── Calculate technical indicators (VWAP, SMA, RSI)
│   ├── Evaluate ALL 9 strategies via Strategy Engine
│   └── Collect generated signals
├── Filter signals by confidence threshold (default 60%)
├── Pre-size signals via Sizing Helper
└── Forward winning signals to Paper Execution Engine
```

## 4.3 Enabled Strategies (Default)

All 9 strategies are enabled by default:
1. `vwap_pullback`
2. `abcd_long`
3. `sma_trend_ride`
4. `breakout`
5. `mean_reversion`
6. `range_trading`
7. `vwap_bounce`
8. `liquidity_trap`
9. `dhma`

## 4.4 Signal Flow

1. **Fetch Pool:** Get all non-expired symbols from Active Filter Pool
2. **Evaluate Strategies:** For each symbol, run all 9 strategies
3. **Build Sized Signals:** Route through `buildSizedSignalForStrategy()`
   - Pre-compute quantity and estimated value
   - Use centralized sizing helper
4. **Filter by Confidence:** Only pass signals ≥ confidence threshold
5. **Forward to Engine:** Call `onSignalCallback()` for each winning signal
6. **Track Statistics:** Update evaluation metrics

---

# 5. Strategy Engine

## 5.1 Purpose

The Strategy Engine contains **pure, deterministic strategy detection functions**. Given price data and indicators, it returns a buy signal (or null).

## 5.2 Architecture

**File:** `server/services/strategy-engine.ts`

| Property | Description |
|----------|-------------|
| **Strategy Count** | 9 active strategies |
| **Input** | Price history, technical indicators, strategy params |
| **Output** | `StrategySignal` or `null` |
| **Side Effects** | None (pure function) |

## 5.3 Strategy Signal Structure

```typescript
interface StrategySignal {
  symbol: string;           // e.g., "BTC/USD"
  strategy: StrategyName;   // e.g., "vwap_pullback"
  entryPrice: number;       // Suggested entry price
  stopPrice: number;        // Stop-loss price
  targetPrice: number;      // Take-profit price
  confidence: number;       // 0.0 - 1.0 (displayed as %)
  metadata?: Record<string, any>; // Strategy-specific data
}
```

## 5.4 Strategy Detection Pattern

Each strategy follows this pattern:

```typescript
detectStrategyName(indicators, priceHistory, params): StrategySignal | null {
  // 1. Validate sufficient data
  if (priceHistory.length < minBars) return null;
  
  // 2. Check entry conditions
  const entryConditionsMet = /* ... */;
  if (!entryConditionsMet) return null;
  
  // 3. Calculate entry, stop, target prices
  const entryPrice = /* ... */;
  const stopPrice = /* ... */;
  const targetPrice = /* ... */;
  
  // 4. Return signal with metadata
  return {
    symbol: '',  // Filled in by orchestrator
    strategy: 'strategy_name',
    entryPrice,
    stopPrice,
    targetPrice,
    confidence: 0.75,
    metadata: { /* strategy-specific */ }
  };
}
```

---

# 6. Position Sizing Helper

## 6.1 Purpose

The Position Sizing Helper calculates **how much to buy** based on portfolio value, risk settings, and guardrail limits. It's a pure function with no database calls.

## 6.2 Architecture

**File:** `server/services/paper-position-sizing.ts`

## 6.3 Sizing Formula (B6 Refactor)

```
1. riskAmount = portfolioValue × (portfolioRiskPerTradePct / 100)
2. stopDistance = |entryPrice - stopPrice|
3. rawQuantity = riskAmount / stopDistance
4. exposureBudget = portfolioValue × (maxTotalExposurePct / 100)
5. maxNotional = exposureBudget × (maxPositionPercentPct / 100)
6. bufferedMaxNotional = maxNotional × 0.97  (3% buffer for price changes)
7. IF (rawQuantity × entryPrice) > bufferedMaxNotional:
      quantity = bufferedMaxNotional / entryPrice  (clamped)
   ELSE:
      quantity = rawQuantity
8. estimatedValue = quantity × entryPrice
```

## 6.4 Input/Output

**Input:**
```typescript
interface PaperPositionSizingParams {
  portfolioValue: number;
  guardrails: GuardrailsV2;
  entryPrice: number;
  stopPrice: number;
  symbol: string;
  strategy: StrategyType;
}
```

**Output:**
```typescript
interface PaperPositionSizingResult {
  quantity: number;
  estimatedValue: number;
  sizingDetails?: {
    portfolioValue: number;
    riskPerTradePct: number;
    riskAmount: number;
    stopDistance: number;
    maxPositionPct: number;
    maxTotalExposurePct: number;
    exposureBudget: number;
    maxNotional: number;
    bufferedMaxNotional: number;
    wasClamped: boolean;
  };
}
```

---

# 7. Trade Safety & Guardrail Checks

## 7.1 Purpose

Trade Safety is the **final gate** before execution. Every signal must pass an 8-step check sequence. Any failure blocks the trade.

## 7.2 Architecture

**File:** `server/services/trade-safety.ts`

## 7.3 Check Sequence

| Order | Check | Block Code | Description |
|-------|-------|------------|-------------|
| 1 | Kill Switch | `KILL_SWITCH` | Trading suspended? |
| 2 | Stop-Loss Required | `NO_STOP_LOSS` | Stop-loss must be present |
| 3 | Stop-Loss Valid | `INVALID_STOP_LOSS` | Stop must be below entry |
| 4 | Max Positions Per Asset | `POSITION_LIMIT` | Max 1 position per symbol |
| 5 | Symbol Cooldown | `COOLDOWN` | Respect cooldown period |
| 6 | Position Size Cap | `MAX_POSITION` | Position within % limit |
| 7 | LPCP Protection | `LPCP_*` | (Dormant - always passes) |
| 8 | Max Open Trades | `MAX_TRADES` | Respect position limit |

## 7.4 Result Codes

| Result | Action |
|--------|--------|
| `OK` | Trade proceeds to execution |
| `KILL_SWITCH` | Trade blocked - kill switch tripped |
| `NO_STOP_LOSS` | Trade blocked - missing stop-loss |
| `COOLDOWN` | Trade blocked - symbol in cooldown |
| `MAX_TRADES` | Trade blocked - at position limit |
| (etc.) | Trade blocked - see block reason |

---

# 8. Paper Execution Engine

## 8.1 Purpose

The Paper Execution Engine **simulates trade execution** and **monitors open positions** for exit conditions.

## 8.2 Architecture

**File:** `server/services/paper-execution-engine.ts`

```
Paper Execution Engine
├── Constructor: mode ('paper' or 'live')
├── start(): Initialize engine, start monitoring loop
├── stop(): Stop monitoring, cleanup
├── processSignal(): Handle incoming signals from orchestrator
├── monitoringCycle(): 1.5-second loop for exit evaluation
├── checkOpenPositions(): Evaluate SL/TP for each position
├── closePosition(): Execute exit with fees/slippage
└── forceClosePosition(): Manual close by user
```

## 8.3 Trade Entry Flow

1. **Receive Signal:** `processSignal(signal)` called by orchestrator
2. **Run Safety Checks:** Call `checkGuardrailRisk()`
3. **Apply Entry Slippage:** `actualEntry = entry × (1 + 0.0015)`
4. **Apply Entry Fee:** `entryFee = actualEntry × quantity × 0.001`
5. **Create Trade Record:** Insert into `paper_sim_trades`
6. **Create Open Position:** Insert into `paper_sim_open_positions`
7. **Subscribe WebSocket:** Add symbol to Kraken WebSocket for live prices
8. **Log RTB Attempt:** Record in `execution_attempt_audit`

## 8.4 Trade Exit Flow (Monitoring Cycle)

1. **Fetch Positions:** Get all `paper_sim_open_positions`
2. **For Each Position:**
   - Fetch live price via `getPriceWithFallback()`
   - Check: `currentPrice <= stopPrice`? → Stop-loss triggered
   - Check: `currentPrice >= targetPrice`? → Take-profit triggered
3. **If Exit Triggered:**
   - Apply exit slippage: `actualExit = price × (1 - 0.0015)` for SL
   - Apply exit fee: `exitFee = actualExit × quantity × 0.001`
   - Calculate P/L: `grossPnl = (exit - entry) × quantity`
   - Calculate costs: `totalCost = entryFee + exitFee + slippage`
   - Calculate net: `netPnl = grossPnl - totalCost`
   - Update trade record with exit data
   - Delete from open positions
   - Update portfolio balance

## 8.5 Cost Model

| Cost Component | Percentage | Calculation |
|----------------|------------|-------------|
| Entry Slippage | 0.15% | Added to entry price |
| Exit Slippage | 0.15% | Subtracted from exit price |
| Entry Fee | 0.10% | `entryPrice × quantity × 0.001` |
| Exit Fee | 0.10% | `exitPrice × quantity × 0.001` |
| **Total Round-Trip** | ~0.50% | Sum of all costs |

---

# 9. Live Pricing & WebSocket

## 9.1 Purpose

The Live Pricing system provides **real-time price data** for open position monitoring. It uses Kraken WebSocket as primary source with REST API fallback.

## 9.2 Architecture

**Files:**
- `server/services/live-pricing-adapter.ts` - Price caching and fallback logic
- `server/services/kraken-websocket-adapter.ts` - WebSocket connection management

## 9.3 Price Pipeline

```
Kraken WebSocket (wss://ws.kraken.com)
    │
    ▼
┌─────────────────────────────────────────┐
│ KrakenWebSocketAdapter                   │
│ • Subscribes to ticker channel           │
│ • Handles reconnection                   │
│ • Normalizes symbols (Kraken → internal) │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ LivePricingAdapter.priceCache            │
│ • Map<symbol, CachedPrice>               │
│ • TTL: 1-2 seconds                       │
│ • Sources: kraken_ws, kraken_rest        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ getPriceWithFallback(symbol, timeout)    │
│ • Check WebSocket cache first            │
│ • If stale: call Kraken REST API         │
│ • Return: { price, source, timestamp }   │
└─────────────────────────────────────────┘
```

## 9.4 Subscription Management

- **On Engine Start:** Subscribe all open position symbols
- **On Trade Open:** Subscribe new symbol
- **On Trade Close:** Unsubscribe symbol (if no other positions)
- **Health Audit:** 5-second interval checks subscription coverage

---

# 10. Cycle Times & Cadences

## 10.1 System Timers

| Component | Interval | Description |
|-----------|----------|-------------|
| **FX5 Scanner** | 30 seconds | Market scan and filter evaluation |
| **Signal Orchestrator** | 30 seconds | Strategy evaluation cycle |
| **Monitoring Cycle** | 1.5 seconds | Open position exit check |
| **WebSocket Tick** | Real-time | Price updates as they arrive |
| **UI Active Trades Poll** | 10 seconds | Frontend data refresh |
| **Active Pool TTL** | 5 minutes | Pair expiry from pool |
| **RTB Signal TTL** | 30 seconds | Signal expires after one FX5 cycle |
| **Symbol Cooldown** | Configurable | Default 15 minutes |

## 10.2 Timing Diagram

```
Time (seconds): 0    1.5   3    4.5   6    ...  28.5  30   31.5  ...
                │     │     │     │     │         │     │     │
FX5 Scanner     ├─────┼─────┼─────┼─────┼─────────┼─────┤     │
                │scan │     │     │     │         │     │scan │
                                                        │
Signal Orch     ├─────┼─────┼─────┼─────┼─────────┼─────┤
                │eval │     │     │     │         │     │eval
                                                        │
Monitor Loop    ├──┬──┼──┬──┼──┬──┼──┬──┼──┬──┬──┬┼──┬──┼──┬──┼
                │SL│  │SL│  │SL│  │SL│  │SL│SL│SL││SL│  │SL│
                │TP│  │TP│  │TP│  │TP│  │TP│TP│TP││TP│  │TP│
                                                        │
WebSocket       ──────────────────────────────────────────────
                ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲
                (price ticks arrive in real-time)
```

---

# PART II: UI TABS & TRACKING SYSTEM

---

# 11. Filter Insights Tab

## 11.1 Purpose

The Filter Insights tab shows **real-time FX5 scanner activity** and the current Active Filter Pool status.

## 11.2 Location

- **Page:** `client/src/pages/active-trades.tsx` (Tab 1)
- **Component:** `client/src/components/trading/filter-insights.tsx`

## 11.3 Data Displayed

| Metric | Description |
|--------|-------------|
| **Evaluated Count** | Total pairs scanned in last cycle |
| **Eligible Count** | Pairs that passed all filters |
| **Ineligible Count** | Pairs that failed one or more filters |
| **Active Pool Size** | Current non-expired pairs in pool |
| **Filter Breakdown** | Count of failures per filter type |
| **24h Window Stats** | Cycles per hour, total scans |
| **Cycle Countdown** | Time until next FX5 scan |

## 11.4 Update Cadence

- **Data Source:** WebSocket events from FX5 Scanner
- **Refresh:** Real-time on each 30-second scan cycle

---

# 12. Ready to Buy Tab

## 12.1 Purpose

The Ready to Buy (RTB) tab shows **signals that passed all checks** and are ready for execution, as well as execution metrics.

## 12.2 Location

- **Page:** `client/src/pages/active-trades.tsx` (Tab 2)
- **Component:** `client/src/components/trading/ready-to-buy-table.tsx`

## 12.3 Data Displayed

| Column | Description |
|--------|-------------|
| **Symbol** | Trading pair (e.g., BTC/USD) |
| **Strategy** | Which strategy generated the signal |
| **Entry Price** | Suggested entry price |
| **Stop Price** | Stop-loss level |
| **Target Price** | Take-profit level |
| **Confidence** | Strategy confidence score (%) |
| **Quantity** | Pre-sized position quantity |
| **Estimated Value** | Position value in USD |

## 12.4 Execution Metrics Panel

Shows RTB pipeline statistics:
- RTB Attempts (total)
- RTB Blocks (by reason)
- RTB Success Rate
- Block breakdown chart

---

# 13. Open Trades Tab

## 13.1 Purpose

The Open Trades tab displays **all currently open positions** with real-time P/L tracking.

## 13.2 Location

- **Page:** `client/src/pages/active-trades.tsx` (Tab 3)
- **Component:** `client/src/components/trading/active-trades-v2.tsx`

## 13.3 Data Displayed

| Column | Description |
|--------|-------------|
| **Symbol** | Trading pair |
| **Strategy** | Strategy that opened the trade |
| **Entry Price** | Actual entry price (with slippage) |
| **Current Price** | Live price from WebSocket/REST |
| **Stop Loss** | Stop-loss level |
| **Take Profit** | Take-profit level |
| **Quantity** | Position size |
| **Unrealized P/L** | Current profit/loss |
| **% Change** | P/L as percentage |
| **Source** | Price source (WS, REST) |
| **Age** | Time since entry |

## 13.4 Global Metrics Bar

Shows aggregate portfolio metrics:
- **Current Balance:** Starting + Realized P/L
- **Open Trades Value:** Sum of all position values
- **Total Equity:** Current Balance + Open Trades Value
- **Unrealized P/L:** Sum of unrealized gains/losses

## 13.5 Update Cadence

- **API Poll:** 10 seconds via `useQuery`
- **WebSocket:** Real-time price updates

---

# 14. Trade History Tab

## 14.1 Purpose

The Trade History tab shows **all closed trades** with full P/L breakdown and filtering capabilities.

## 14.2 Location

- **Page:** `client/src/pages/active-trades.tsx` (Tab 4)
- **Component:** `client/src/components/trading/trade-history-tab.tsx`

## 14.3 Data Displayed

| Column | Description |
|--------|-------------|
| **Symbol** | Trading pair |
| **Strategy** | Strategy that opened the trade |
| **Entry Price** | Actual entry price |
| **Exit Price** | Actual exit price |
| **Quantity** | Position size |
| **Entry Fee** | Fee paid on entry |
| **Exit Fee** | Fee paid on exit |
| **Slippage** | Total slippage cost |
| **Gross P/L** | P/L before costs |
| **Net P/L** | P/L after all costs |
| **Close Reason** | target_hit, stop_hit, manual |
| **Duration** | How long trade was open |
| **Opened At** | Entry timestamp |
| **Closed At** | Exit timestamp |

## 14.4 Filters Available

- **Symbol Search:** Filter by trading pair
- **Strategy Filter:** Filter by strategy type
- **Date Range:** From/To date selection
- **Close Reason:** Filter by exit type
- **Pagination:** Server-side pagination

---

# PART III: TRADING STRATEGIES

---

# 15. Strategy Catalog

## 15.1 Overview

DawnTrader V3 implements **9 trading strategies**:

| # | Strategy | Confidence | Status |
|---|----------|------------|--------|
| 1 | VWAP Pullback | 0.70-0.90 | ✅ Active |
| 2 | ABCD Long | 0.75 | ✅ Active |
| 3 | SMA Trend Ride | 0.65 | ✅ Active |
| 4 | Breakout | 0.75 | ✅ Active |
| 5 | Mean Reversion | 0.70 | ✅ Active |
| 6 | Range Trading | 0.72 | ✅ Active |
| 7 | VWAP Bounce | 0.73 | ✅ Active |
| 8 | Liquidity Trap | 0.68 | ✅ Active |
| 9 | DHMA | Variable | ✅ Active |

## 15.2 Strategy Details

### Strategy 1: VWAP Pullback
- **Entry:** Price above VWAP, pullback to VWAP, bullish reversal, volume confirmation
- **Exit:** Price closes below VWAP
- **Best For:** Trending markets with clean pullbacks

### Strategy 2: ABCD Long
- **Entry:** A=spike, B=pullback, C=higher low, D=breakout above C
- **Exit:** Fixed target or trailing stop
- **Best For:** Harmonic pattern setups

### Strategy 3: SMA Trend Ride
- **Entry:** Price above SMA, crossover or bounce pattern
- **Exit:** Price closes below SMA
- **Best For:** Strong trend-following

### Strategy 4: Breakout
- **Entry:** Price breaks above consolidation resistance with volume
- **Exit:** Price returns below breakout level
- **Best For:** Range breakouts

### Strategy 5: Mean Reversion
- **Entry:** Price oversold (below mean by threshold), bullish reversal
- **Exit:** Price returns to mean
- **Best For:** Oversold bounces

### Strategy 6: Range Trading
- **Entry:** Price near support in established range
- **Exit:** Price breaks resistance
- **Best For:** Sideways markets

### Strategy 7: VWAP Bounce
- **Entry:** VWAP trending up, price bounced off VWAP, volume confirmation
- **Exit:** Price closes below VWAP
- **Best For:** Intraday VWAP plays

### Strategy 8: Liquidity Trap
- **Entry:** False breakout above resistance, quick return to range
- **Exit:** Price returns above trap level
- **Best For:** Contrarian false breakout plays

### Strategy 9: DHMA (Dual-Horizon Microstructure Alpha)
- **Entry:** OBI > threshold, low toxicity, VWAP confirmation
- **Exit:** Microstructure conditions reverse
- **Best For:** Advanced microstructure analysis

---

# PART IV: CONFIGURATION COMPONENTS

---

# 16. Guardrails System

## 16.1 Core Four Guardrails

| Guardrail | Default | Range | Description |
|-----------|---------|-------|-------------|
| Portfolio Risk per Trade % | 1.50% | 0.10-5.00% | Risk per trade |
| Symbol Cooldown | 15 min | 0-90 min | Cooldown period |
| Max Open Positions | 5 | 1-20 | Position limit |
| Daily Loss Kill Switch % | 7.00% | 1.00-25.00% | Auto-shutdown threshold |

## 16.2 Extended Guardrails

| Guardrail | Default | Range | Description |
|-----------|---------|-------|-------------|
| Max Position % | 30.00% | 1-100% | Single position cap |
| Max Total Exposure % | 25.00% | 10-100% | Total portfolio exposure |

---

# 17. LPCP Module

**Status:** DORMANT

The Low-Priced Coin Protection module is structurally preserved but not active. The `checkLowPricedCoinProtection()` function immediately returns `{ ok: true }`.

---

# 18. Screener Filters

Filter categories:
- **Price/Volume:** minVolume, minPrice, maxPrice, minLiquidity
- **Technical:** maxBidAskSpread, rsiMin, rsiMax, volatilityMin, volatilityMax
- **Data Quality:** minHistoryDays, excludeStablecoins
- **Universe/Signal:** universeSize, confidenceThreshold, activeTimeframes

---

# 19. Coherency Rules

10 rules enforcing guardrail consistency. Key rules:
- **RULE_001:** Risk ≤ 50% × KillSwitch
- **RULE_002:** Total Exposure ≤ 50% Cap
- **RULE_005:** Mutual exclusivity of LATTi and manual override

---

# 20. Goals Presets

5 presets: conservative, baseline, optimistic, maximum, custom

Adaptive Learning: Expands boundaries by 5% when 30-day performance ≥ 80% of target.

---

# 21. LATTi vs Manual Control

- **LATTi-Managed:** System optimizes guardrails (current default)
- **Manual Override:** User controls values directly
- **Current LATTi State:** PASSIVE-ONLY (observes, doesn't control trades)

---

# PART V: PHASE 11 LIVE MODE TRANSITION

---

# 22. Live Mode Implementation Plan

## 22.1 Current State

The Paper Execution Engine is **fully functional for simulated trading**. In Phase 11, we will copy this engine and modify it to execute **real trades on Kraken**.

## 22.2 What Will Stay the Same

| Component | Status |
|-----------|--------|
| FX5 Scanner | ✅ Reuse as-is |
| Active Filter Pool | ✅ Reuse as-is |
| Signal Orchestrator | ✅ Reuse as-is |
| Strategy Engine | ✅ Reuse as-is |
| Position Sizing Helper | ✅ Reuse as-is |
| Trade Safety Checks | ✅ Reuse as-is |
| Guardrails System | ✅ Reuse as-is |
| WebSocket Price Feed | ✅ Reuse as-is |

## 22.3 What Will Need to Change

| Component | Required Changes |
|-----------|------------------|
| **Trade Execution** | Replace simulated execution with Kraken API calls |
| **Order Submission** | Implement `kraken.createOrder()` with proper parameters |
| **Order Confirmation** | Wait for Kraken order confirmation before creating trade record |
| **Slippage Handling** | Use actual fill price instead of simulated slippage |
| **Fee Calculation** | Use actual Kraken fees instead of simulated 0.10% |
| **Balance Tracking** | Query Kraken account balance instead of simulated balance |
| **Position Management** | Sync with Kraken open orders/positions |
| **Error Handling** | Handle Kraken API errors (rate limits, insufficient funds, etc.) |
| **Order Types** | Implement limit orders, market orders, stop-loss orders |
| **Partial Fills** | Handle partial order fills |

## 22.4 Key Discussion Points

### 22.4.1 Order Execution Strategy

**Question:** Market orders vs. Limit orders?

| Approach | Pros | Cons |
|----------|------|------|
| Market Order | Guaranteed fill | Slippage risk |
| Limit Order | Price control | May not fill |
| Hybrid | Best of both | Complexity |

**Recommendation:** Start with market orders for simplicity, then add limit order support.

### 22.4.2 Slippage Reality

In paper mode, we simulate 0.15% slippage. In live mode:
- **Actual slippage varies** based on liquidity and order size
- **Large orders** may have significant price impact
- **Solution:** Use Kraken's "leverage" order type or implement TWAP for large orders

### 22.4.3 Fee Structure

Kraken fees depend on:
- Trading volume (tier-based)
- Order type (maker vs. taker)
- **Solution:** Query actual fees from Kraken API or use tier-based lookup

### 22.4.4 Balance Synchronization

| Approach | Description |
|----------|-------------|
| **Option A:** Query Kraken on each trade | Accurate but slow |
| **Option B:** Cache balance, update on trade | Fast but may drift |
| **Option C:** WebSocket balance updates | Real-time but complex |

**Recommendation:** Option B with periodic reconciliation.

### 22.4.5 Error Handling

Live mode must handle:
- Rate limiting (429 errors)
- Insufficient funds
- API timeouts
- Order rejection
- Partial fills
- Network failures

### 22.4.6 Safety Mechanisms

| Mechanism | Paper Mode | Live Mode |
|-----------|------------|-----------|
| Kill Switch | Simulated | CRITICAL - must stop real orders |
| Max Position | Simulated | CRITICAL - must prevent over-allocation |
| Daily Loss Limit | Simulated | CRITICAL - must halt trading |

**Live mode safety is non-negotiable.** All guardrails must work correctly.

## 22.5 Implementation Phases

### Phase 11.1: Live Execution Engine Scaffold
- Copy `PaperExecutionEngine` to `LiveExecutionEngine`
- Add Kraken API order methods
- Implement order confirmation flow

### Phase 11.2: Order Execution
- Implement `submitMarketOrder()`
- Handle order confirmations
- Track actual fill prices and fees

### Phase 11.3: Balance & Position Sync
- Query Kraken balances
- Sync open positions
- Handle discrepancies

### Phase 11.4: Error Handling
- Rate limit backoff
- Retry logic
- Failure notifications

### Phase 11.5: Safety Verification
- Kill switch testing
- Guardrail enforcement verification
- Manual override testing

### Phase 11.6: Parallel Running
- Run paper + live side-by-side
- Compare execution results
- Validate P/L calculations

---

# Appendix: Key File Locations

## Trading Engine Files
| Component | File |
|-----------|------|
| FX5 Scanner | `server/services/fx5-scanner.ts` |
| Active Filter Pool | `server/services/active-filter-pool.ts` |
| Signal Orchestrator | `server/services/signal-orchestrator.ts` |
| Strategy Engine | `server/services/strategy-engine.ts` |
| Position Sizing | `server/services/paper-position-sizing.ts` |
| Trade Safety | `server/services/trade-safety.ts` |
| Paper Execution Engine | `server/services/paper-execution-engine.ts` |
| Live Pricing Adapter | `server/services/live-pricing-adapter.ts` |
| Kraken WebSocket | `server/services/kraken-websocket-adapter.ts` |
| Guardrail Policy | `server/services/guardrail-policy.ts` |

## UI Files
| Component | File |
|-----------|------|
| Trading Page | `client/src/pages/active-trades.tsx` |
| Filter Insights | `client/src/components/trading/filter-insights.tsx` |
| Ready to Buy | `client/src/components/trading/ready-to-buy-table.tsx` |
| Active Trades | `client/src/components/trading/active-trades-v2.tsx` |
| Trade History | `client/src/components/trading/trade-history-tab.tsx` |

## Database Tables
| Table | Purpose |
|-------|---------|
| `paper_sim_trades` | All paper trades (open + closed) |
| `paper_sim_open_positions` | Currently open positions |
| `paper_sim_portfolio` | Portfolio balance tracking |
| `execution_attempt_audit` | RTB attempt logging |
| `guardrails_v2` | Guardrail configuration |
| `screener_filters` | Filter configuration |
| `goals_presets` | Risk profile presets |

---

**Document Status:** Complete  
**Last Updated:** December 12, 2025  
**Version:** 2.0 (Expanded with Trading Engine Flow)
