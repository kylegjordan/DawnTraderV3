# DawnTrader — System Architecture & Execution Flow Overview

**Document Created:** December 12, 2025  
**Last Updated:** December 29, 2025  
**Purpose:** Complete factual reference for system architecture, data flows, and execution cadences  
**Scope:** Paper trading pipeline (Phase 8.8.3 architecture) + Validation Framework (Phase 8.8.4)

---

# Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Classification](#2-component-classification)
3. [End-to-End Trading Pipeline](#3-end-to-end-trading-pipeline)
4. [Execution Cycles & Cadences](#4-execution-cycles--cadences)
5. [Trade Lifecycle: Entry Flow](#5-trade-lifecycle-entry-flow)
6. [Trade Lifecycle: Exit Flow](#6-trade-lifecycle-exit-flow)
7. [Balance & Portfolio Updates](#7-balance--portfolio-updates)
8. [Guardrail Read Locations](#8-guardrail-read-locations)
9. [WebSocket & UI Propagation](#9-websocket--ui-propagation)
10. [Database Schema Summary](#10-database-schema-summary)
11. [System Constants & Invariants](#11-system-constants--invariants)
12. [Validation Framework (Phase 8.8.4)](#12-validation-framework-phase-884)

---

# 1. System Overview

DawnTrader is a cryptocurrency day trading simulation platform built on a multi-layer pipeline architecture. The system continuously scans markets, evaluates trading strategies, and executes simulated trades with realistic cost modeling.

## 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DAWNTRADER SYSTEM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                         MARKET DATA LAYER                                   │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │    │
│  │  │  Kraken REST    │    │ Kraken WebSocket│    │ Binance/CoinGecko│       │    │
│  │  │  (OHLC, Ticker) │    │ (Real-time Ticks)│   │   (Fallback)    │        │    │
│  │  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │    │
│  │           │                      │                      │                  │    │
│  │           └──────────────────────┼──────────────────────┘                  │    │
│  │                                  ▼                                          │    │
│  │                    ┌─────────────────────────────┐                         │    │
│  │                    │     LivePricingAdapter      │                         │    │
│  │                    │   (Unified Price Cache)     │                         │    │
│  │                    └─────────────────────────────┘                         │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                       SCANNING & FILTERING LAYER                            │    │
│  │                                                                             │    │
│  │    ┌─────────────────┐         ┌─────────────────────────────┐            │    │
│  │    │   FX5 Scanner   │────────▶│     Active Filter Pool       │            │    │
│  │    │  (30s cycle)    │         │  (In-memory, 5-min TTL)      │            │    │
│  │    │                 │         │                               │            │    │
│  │    │ • 60 pairs/scan │         │  • Deduped survivors          │            │    │
│  │    │ • All filters   │         │  • Mode-isolated (paper/live) │            │    │
│  │    │ • Top-N + Tier-B│         │  • TTL expiry enforcement     │            │    │
│  │    └─────────────────┘         └──────────────┬────────────────┘            │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                  │                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                       SIGNAL GENERATION LAYER                               │    │
│  │                                                                             │    │
│  │    ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │    │                   Signal Orchestrator (30s cycle)                │    │    │
│  │    │                                                                  │    │    │
│  │    │   For each symbol in Active Pool:                                │    │    │
│  │    │   ├── Fetch OHLC history + Calculate indicators                  │    │    │
│  │    │   ├── Evaluate ALL 9 strategies via Strategy Engine             │    │    │
│  │    │   ├── Size positions via Paper Position Sizing Helper           │    │    │
│  │    │   └── Filter by confidence threshold (default 60%)              │    │    │
│  │    │                                                                  │    │    │
│  │    │   ┌─────────────────────────────────────────────────────────┐   │    │    │
│  │    │   │                  Strategy Engine                        │   │    │    │
│  │    │   │  (Pure, Stateless, 9 Strategies)                        │   │    │    │
│  │    │   │                                                         │   │    │    │
│  │    │   │  1. vwap_pullback    6. range_trading                   │   │    │    │
│  │    │   │  2. abcd_long        7. vwap_bounce                     │   │    │    │
│  │    │   │  3. sma_trend_ride   8. liquidity_trap                  │   │    │    │
│  │    │   │  4. breakout         9. dhma                            │   │    │    │
│  │    │   │  5. mean_reversion                                      │   │    │    │
│  │    │   └─────────────────────────────────────────────────────────┘   │    │    │
│  │    └───────────────────────────────────┬─────────────────────────────┘    │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                           │                                         │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                        RISK MANAGEMENT LAYER                                │    │
│  │                                                                             │    │
│  │    ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │    │               Trade Safety Checks (8-Step Sequence)              │    │    │
│  │    │                                                                  │    │    │
│  │    │   1. Kill Switch ─────────────────────────────────────────────  │    │    │
│  │    │   2. Stop-Loss Required ──────────────────────────────────────  │    │    │
│  │    │   3. Stop-Loss Valid ─────────────────────────────────────────  │    │    │
│  │    │   4. Max 1 Position Per Asset ────────────────────────────────  │    │    │
│  │    │   5. Symbol Cooldown ─────────────────────────────────────────  │    │    │
│  │    │   6. Position Size Cap ───────────────────────────────────────  │    │    │
│  │    │   7. LPCP Protection (Dormant) ───────────────────────────────  │    │    │
│  │    │   8. Max Open Trades ─────────────────────────────────────────  │    │    │
│  │    │                                                                  │    │    │
│  │    │   Result: ✅ PASS → Execute  |  ❌ BLOCK → Log reason, skip     │    │    │
│  │    └───────────────────────────────┬─────────────────────────────────┘    │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                        EXECUTION & MONITORING LAYER                         │    │
│  │                                                                             │    │
│  │    ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │    │               Paper Execution Engine (1.5s cycle)                │    │    │
│  │    │                                                                  │    │    │
│  │    │   ENTRY:                      EXIT MONITORING:                   │    │    │
│  │    │   • Apply entry slippage      • Fetch live price (WebSocket)    │    │    │
│  │    │   • Apply entry fee           • Check stop-loss trigger         │    │    │
│  │    │   • Create trade record       • Check take-profit trigger       │    │    │
│  │    │   • Create open position      • Apply exit slippage + fees      │    │    │
│  │    │   • Subscribe WebSocket       • Calculate P/L (gross, net)      │    │    │
│  │    │                               • Close position                   │    │    │
│  │    │                               • Update balance                   │    │    │
│  │    └───────────────────────────────┬─────────────────────────────────┘    │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                          PERSISTENCE LAYER                                  │    │
│  │                                                                             │    │
│  │    ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │    │
│  │    │ paper_sim_trades  │  │paper_sim_open_    │  │paper_sim_portfolio│    │    │
│  │    │                   │  │     positions     │  │                   │    │    │
│  │    │ All trade records │  │ Current positions │  │ Balance tracking  │    │    │
│  │    └───────────────────┘  └───────────────────┘  └───────────────────┘    │    │
│  │                                                                             │    │
│  │    ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │    │
│  │    │   guardrails_v2   │  │  screener_filters │  │execution_attempt_ │    │    │
│  │    │                   │  │                   │  │      audit        │    │    │
│  │    │ Risk parameters   │  │ Filter config     │  │ RTB audit log     │    │    │
│  │    └───────────────────┘  └───────────────────┘  └───────────────────┘    │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 2. Component Classification

## 2.1 Stateless vs Stateful Components

| Component | Classification | Description |
|-----------|---------------|-------------|
| **Strategy Engine** | Stateless | Pure functions, no side effects |
| **Position Sizing Helper** | Stateless | Deterministic calculation, no DB calls |
| **Trade Safety Checks** | Stateless (per call) | Reads DB per invocation |
| **FX5 Scanner** | Stateful | Maintains cycle counters, 24h window |
| **Active Filter Pool** | Stateful | In-memory Map with TTL entries |
| **Signal Orchestrator** | Stateful | Running state, evaluation timer |
| **Paper Execution Engine** | Stateful | Running state, monitoring loop |
| **Paper Portfolio Manager** | Stateful | Manages engine lifecycle |

## 2.2 In-Memory vs Database-Backed

| Data Type | Storage | File Reference |
|-----------|---------|----------------|
| Active Filter Pool | In-memory Map | `active-filter-pool.ts` |
| Price Cache | In-memory Map | `live-pricing-adapter.ts` |
| WebSocket Subscriptions | In-memory Set | `kraken-websocket-adapter.ts` |
| Engine Running State | In-memory Boolean | `paper-execution-engine.ts` |
| Trades | PostgreSQL | `paper_sim_trades` table |
| Open Positions | PostgreSQL | `paper_sim_open_positions` table |
| Portfolio Balance | PostgreSQL | `paper_sim_portfolio` table |
| Guardrails | PostgreSQL | `guardrails_v2` table |
| Filter Settings | PostgreSQL | `screener_filters` table |

## 2.3 Sync vs Async Loops

| Loop | Type | Interval | File Reference |
|------|------|----------|----------------|
| FX5 Scanner (paper) | Async interval | 30 seconds | `fx5-scanner.ts:83` |
| FX5 Scanner (live) | Async interval | 30 seconds | `fx5-scanner.ts:91` |
| Signal Orchestrator | Async interval | 30 seconds | `signal-orchestrator.ts:131` |
| Position Monitoring | Async interval | 1.5 seconds | `paper-execution-engine.ts:199` |
| WebSocket Subscription Audit | Async interval | 5 seconds | `kraken-websocket-adapter.ts` |

---

# 3. End-to-End Trading Pipeline

## 3.1 Complete Pipeline Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         END-TO-END TRADING PIPELINE FLOW                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   STAGE 1: MARKET SCANNING                                                           │
│   ────────────────────────                                                           │
│                                                                                      │
│   ┌──────────────────┐     ┌──────────────────┐                                     │
│   │   Kraken REST    │────▶│   FX5 Scanner    │                                     │
│   │   Market Data    │     │   (30s cycle)    │                                     │
│   └──────────────────┘     └────────┬─────────┘                                     │
│                                     │                                                │
│                                     │ survivors[] (passed all filters)               │
│                                     ▼                                                │
│                            ┌──────────────────┐                                     │
│                            │ Active Filter    │                                     │
│                            │ Pool (5-min TTL) │                                     │
│                            └────────┬─────────┘                                     │
│                                     │                                                │
│   STAGE 2: SIGNAL GENERATION        │                                                │
│   ──────────────────────────        │                                                │
│                                     │ getSurvivors()                                 │
│                                     ▼                                                │
│                            ┌──────────────────┐                                     │
│                            │ Signal           │                                     │
│                            │ Orchestrator     │                                     │
│                            │ (30s cycle)      │                                     │
│                            └────────┬─────────┘                                     │
│                                     │                                                │
│              ┌──────────────────────┼──────────────────────┐                        │
│              ▼                      ▼                      ▼                        │
│   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐              │
│   │ Kraken OHLC      │   │ Strategy Engine  │   │ Position Sizing  │              │
│   │ (60m history)    │   │ (9 strategies)   │   │ Helper           │              │
│   └──────────────────┘   └──────────────────┘   └──────────────────┘              │
│              │                      │                      │                        │
│              └──────────────────────┼──────────────────────┘                        │
│                                     │                                                │
│                                     │ StrategySignal[] (sized, validated)            │
│                                     ▼                                                │
│   STAGE 3: SAFETY CHECKS            │                                                │
│   ──────────────────────            │                                                │
│                                     ▼                                                │
│                            ┌──────────────────┐                                     │
│                            │ Trade Safety     │                                     │
│                            │ (8-step checks)  │                                     │
│                            └────────┬─────────┘                                     │
│                                     │                                                │
│                        ┌────────────┴────────────┐                                  │
│                        │                         │                                  │
│                   ✅ PASS                   ❌ BLOCK                                 │
│                        │                         │                                  │
│                        ▼                         ▼                                  │
│   STAGE 4: EXECUTION   │          ┌──────────────────┐                             │
│   ──────────────────   │          │ execution_attempt│                             │
│                        │          │ _audit (logged)  │                             │
│                        ▼          └──────────────────┘                             │
│            ┌───────────────────────────────────────┐                               │
│            │        Paper Execution Engine          │                               │
│            │                                        │                               │
│            │  ┌─────────────────────────────────┐  │                               │
│            │  │ ENTRY PROCESSING                │  │                               │
│            │  │ • Apply 0.15% entry slippage    │  │                               │
│            │  │ • Apply 0.10% entry fee         │  │                               │
│            │  │ • Insert paper_sim_trades       │◀─┼── TRADES CREATED HERE         │
│            │  │ • Insert paper_sim_open_positions│ │                               │
│            │  │ • Subscribe WebSocket           │  │                               │
│            │  └─────────────────────────────────┘  │                               │
│            │                                        │                               │
│            │  ┌─────────────────────────────────┐  │                               │
│            │  │ EXIT MONITORING (1.5s cycle)    │  │                               │
│            │  │ • Fetch live price (WebSocket)  │  │                               │
│            │  │ • Check: price <= stopLoss?     │  │                               │
│            │  │ • Check: price >= takeProfit?   │  │                               │
│            │  │ • Apply 0.15% exit slippage     │  │                               │
│            │  │ • Apply 0.10% exit fee          │  │                               │
│            │  │ • Calculate P/L (gross, net)    │  │                               │
│            │  │ • Update paper_sim_trades       │◀─┼── TRADES CLOSED HERE          │
│            │  │ • Delete paper_sim_open_positions│ │                               │
│            │  │ • Update paper_sim_portfolio    │◀─┼── BALANCES UPDATED HERE       │
│            │  └─────────────────────────────────┘  │                               │
│            └───────────────────────────────────────┘                               │
│                                     │                                                │
│   STAGE 5: UI PROPAGATION           │                                                │
│   ───────────────────────           │                                                │
│                                     ▼                                                │
│            ┌───────────────────────────────────────┐                               │
│            │          WebSocket Broadcasts          │                               │
│            │                                        │                               │
│            │  • trade_event (entry/exit)            │                               │
│            │  • portfolio_update                    │                               │
│            │  • price_updated                       │                               │
│            │  • trading_pipeline_event              │                               │
│            │  • fx5_scan_complete                   │                               │
│            └───────────────────────────────────────┘                               │
│                                     │                                                │
│                                     ▼                                                │
│            ┌───────────────────────────────────────┐                               │
│            │          React Frontend                │                               │
│            │                                        │                               │
│            │  • Active Trades tab (10s poll)        │                               │
│            │  • Trade History tab                   │                               │
│            │  • Filter Insights tab                 │                               │
│            │  • Ready to Buy tab                    │                               │
│            └───────────────────────────────────────┘                               │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 4. Execution Cycles & Cadences

## 4.1 Cycle Timing Summary

| Cycle | Interval | File | Line | Description |
|-------|----------|------|------|-------------|
| FX5 Scanner | 30,000 ms | `fx5-scanner.ts` | 30 | Market scanning |
| Signal Orchestrator | 30,000 ms | `signal-orchestrator.ts` | 75 | Strategy evaluation |
| Position Monitoring | 1,500 ms | `paper-execution-engine.ts` | 97 | SL/TP checking |
| WebSocket Audit | 5,000 ms | `kraken-websocket-adapter.ts` | - | Subscription health |
| Active Pool TTL | 300,000 ms | `active-filter-pool.ts` | 20 | Entry expiration |
| RTB TTL | 30,000 ms | `paper-execution-engine.ts` | 99 | Signal expiration |

## 4.2 Cycle Relationship Diagram

```
Timeline (seconds):
0        15       30       45       60       75       90
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│                   │                   │                   │
│ FX5 SCAN          │ FX5 SCAN          │ FX5 SCAN          │
│     ↓             │     ↓             │     ↓             │
│  Pool Update      │  Pool Update      │  Pool Update      │
│                   │                   │                   │
│ ORCHESTRATOR      │ ORCHESTRATOR      │ ORCHESTRATOR      │
│     ↓             │     ↓             │     ↓             │
│  Signals          │  Signals          │  Signals          │
│                   │                   │                   │
├─┬─┬─┬─┬─┬─┬─┬─┬─┬─┼─┬─┬─┬─┬─┬─┬─┬─┬─┬─┼─┬─┬─┬─┬─┬─┬─┬─┬─┬─┤
│ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
│ POSITION MONITORING (every 1.5 seconds)                   │
│ └─ Check SL/TP for each open position                     │
│                                                           │
└───────────────────────────────────────────────────────────┘

Legend:
- FX5 SCAN: Runs every 30 seconds, populates Active Filter Pool
- ORCHESTRATOR: Runs every 30 seconds, evaluates strategies
- POSITION MONITORING: Runs every 1.5 seconds, checks exit conditions
```

---

# 5. Trade Lifecycle: Entry Flow

## 5.1 Where Trades Are Created

**Primary Location:** `server/services/paper-execution-engine.ts`

**Method:** `processSignal()` → creates trade record

**Detailed Flow:**

```
1. Signal Orchestrator generates StrategySignal
   └─ File: signal-orchestrator.ts:378

2. onSignalCallback forwards to execution engine
   └─ File: paper-portfolio-manager.ts:207

3. processSignal() receives signal
   └─ File: paper-execution-engine.ts

4. checkGuardrailRisk() validates signal
   └─ File: trade-safety.ts

5. IF PASS: Create trade and position
   ├─ storage.insertPaperSimTrade()
   │  └─ Table: paper_sim_trades
   └─ storage.insertPaperSimOpenPosition()
      └─ Table: paper_sim_open_positions

6. Subscribe to WebSocket for live price updates
   └─ krakenWebSocketAdapter.subscribe(symbol)

7. Log to execution_attempt_audit
   └─ Table: execution_attempt_audit
```

## 5.2 Entry Cost Model

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY COST CALCULATION                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  signalPrice = 100.00 (example)                            │
│                                                             │
│  STEP 1: Apply Entry Slippage (0.15%)                       │
│  ─────────────────────────────────────                      │
│  actualEntryPrice = signalPrice × (1 + 0.0015)              │
│  actualEntryPrice = 100.00 × 1.0015 = 100.15               │
│                                                             │
│  STEP 2: Calculate Entry Fee (0.10%)                        │
│  ──────────────────────────────────                         │
│  entryFee = actualEntryPrice × quantity × 0.001             │
│  entryFee = 100.15 × 10 × 0.001 = $1.0015                  │
│                                                             │
│  STEP 3: Calculate Entry Slippage Cost                      │
│  ─────────────────────────────────────                      │
│  entrySlippage = (actualEntry - signalPrice) × quantity     │
│  entrySlippage = (100.15 - 100.00) × 10 = $1.50            │
│                                                             │
│  Total Entry Cost = entryFee + entrySlippage                │
│  Total Entry Cost = $1.0015 + $1.50 = $2.50 (approx)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 6. Trade Lifecycle: Exit Flow

## 6.1 Where Trades Are Closed

**Primary Location:** `server/services/paper-execution-engine.ts`

**Method:** `closePosition()` called from `checkOpenPositions()`

**Detailed Flow:**

```
1. Monitoring cycle (every 1.5s)
   └─ File: paper-execution-engine.ts:199

2. checkOpenPositions() iterates all positions
   └─ File: paper-execution-engine.ts:472

3. Fetch live price via getPriceWithFallback()
   └─ File: live-pricing-adapter.ts

4. Evaluate exit conditions:
   ├─ currentPrice <= stopLoss → Stop-loss triggered
   └─ currentPrice >= takeProfit → Take-profit triggered

5. IF EXIT TRIGGERED: closePosition()
   ├─ Apply exit slippage (0.15%)
   ├─ Apply exit fee (0.10%)
   ├─ Calculate grossPnl, netPnl
   ├─ Update paper_sim_trades (status='closed')
   ├─ Delete from paper_sim_open_positions
   └─ Update paper_sim_portfolio (balance)
```

## 6.2 Exit Cost Model

```
┌─────────────────────────────────────────────────────────────┐
│                     EXIT COST CALCULATION                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  triggerPrice = 98.00 (stop-loss hit)                       │
│  entryPrice = 100.15 (actual entry after slippage)         │
│  quantity = 10                                              │
│                                                             │
│  STEP 1: Apply Exit Slippage (0.15%)                        │
│  ────────────────────────────────────                       │
│  For STOP-LOSS (selling into weakness):                     │
│  actualExitPrice = triggerPrice × (1 - 0.0015)              │
│  actualExitPrice = 98.00 × 0.9985 = 97.85                  │
│                                                             │
│  STEP 2: Calculate Exit Fee (0.10%)                         │
│  ─────────────────────────────────                          │
│  exitFee = actualExitPrice × quantity × 0.001               │
│  exitFee = 97.85 × 10 × 0.001 = $0.9785                    │
│                                                             │
│  STEP 3: Calculate Exit Slippage Cost                       │
│  ────────────────────────────────────                       │
│  exitSlippage = |triggerPrice - actualExitPrice| × quantity │
│  exitSlippage = |98.00 - 97.85| × 10 = $1.50               │
│                                                             │
│  STEP 4: Calculate P/L                                      │
│  ──────────────────────                                     │
│  grossPnl = (actualExitPrice - actualEntryPrice) × quantity │
│  grossPnl = (97.85 - 100.15) × 10 = -$23.00                │
│                                                             │
│  totalCost = entryFee + exitFee + entrySlippage + exitSlip │
│  totalCost = 1.00 + 0.98 + 1.50 + 1.50 = $4.98 (approx)   │
│                                                             │
│  netPnl = grossPnl - totalCost                              │
│  netPnl = -$23.00 - $4.98 = -$27.98                        │
│                                                             │
│  Total Round-Trip Cost: ~0.50% of position value            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 7. Balance & Portfolio Updates

## 7.1 Where Balances Are Updated

**Primary Location:** `server/services/paper-execution-engine.ts`

**Trigger:** Position close (stop-loss, take-profit, or manual)

**Balance Calculation:**

```
┌─────────────────────────────────────────────────────────────┐
│                   BALANCE UPDATE FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 paper_sim_portfolio                  │   │
│  │                                                      │   │
│  │  startingBalance: $1,000.00 (user-configured)       │   │
│  │  cashBalance: currentCash (starting + realized P/L) │   │
│  │  realizedPnl: sum of all closed trade netPnl        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CURRENT BALANCE FORMULA (for Guardrails):                  │
│  ────────────────────────────────────────                   │
│  currentBalance = startingBalance + realizedPnl             │
│                                                             │
│  Example:                                                   │
│  - startingBalance = $1,000.00                             │
│  - Trade 1 closed: netPnl = +$50.00                        │
│  - Trade 2 closed: netPnl = -$30.00                        │
│  - realizedPnl = $50.00 - $30.00 = $20.00                 │
│  - currentBalance = $1,000.00 + $20.00 = $1,020.00        │
│                                                             │
│  PORTFOLIO VALUE FORMULA (for display):                     │
│  ─────────────────────────────────────                      │
│  portfolioValue = currentBalance + unrealizedPnl            │
│                                                             │
│  Where:                                                     │
│  unrealizedPnl = Σ(currentPrice - avgPrice) × quantity      │
│  for all open positions                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 7.2 C7 Balance Semantics

Per Phase C7 implementation:

| Metric | Definition | Used For |
|--------|------------|----------|
| `cashBalance` | startingBalance + realizedPnl | Guardrail risk calculations |
| `portfolioValue` | cashBalance + unrealizedPnl | UI display, reporting |
| `currentBalance` | Same as cashBalance | Green bar "Current Bal + Open Trades" |

---

# 8. Guardrail Read Locations

## 8.1 Where Guardrails Are Read

| Component | File | Purpose |
|-----------|------|---------|
| Signal Orchestrator | `signal-orchestrator.ts:315` | Portfolio value for sizing |
| Paper Position Sizing | `paper-position-sizing.ts` | Max position %, risk % |
| Trade Safety Checks | `trade-safety.ts` | All 8 pre-trade checks |
| Guardrail Policy Service | `guardrail-policy.ts:170` | Effective value resolution |
| Risk Manager | `risk-manager.ts` | Legacy kill switch check |

## 8.2 Guardrail Read Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   GUARDRAIL READ FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DATABASE: guardrails_v2                                    │
│  ────────────────────────                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ id, mode, portfolioRiskPerTradePct,                 │   │
│  │ symbolCooldownMinutes, maxOpenPositions,            │   │
│  │ dailyLossKillSwitchPct, killSwitchTripped,         │   │
│  │ maxPositionPercentPct, maxTotalExposurePct,        │   │
│  │ isManualOverride, tunedByLatti, lockedByUser       │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              storage.getGuardrailsV2()               │   │
│  │                     ↓                                │   │
│  │         guardrailPolicy.getEffective()               │   │
│  │                     ↓                                │   │
│  │    Returns: EffectiveGuardrails (resolved values)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│   │ Position │     │  Trade   │     │ Kill     │          │
│   │  Sizing  │     │  Safety  │     │ Switch   │          │
│   │          │     │  Checks  │     │  Check   │          │
│   └──────────┘     └──────────┘     └──────────┘          │
│                                                             │
│  CORE FOUR GUARDRAILS (checked on every trade):            │
│  ──────────────────────────────────────────────            │
│  1. portfolioRiskPerTradePct - Max risk per trade          │
│  2. symbolCooldownMinutes - Cooldown between trades        │
│  3. maxOpenPositions - Max concurrent positions            │
│  4. dailyLossKillSwitchPct - Daily loss limit (kill switch)│
│                                                             │
│  ADDITIONAL GUARDRAILS:                                     │
│  ─────────────────────                                      │
│  5. maxPositionPercentPct - Max single position size       │
│  6. maxTotalExposurePct - Max total portfolio exposure     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 9. WebSocket & UI Propagation

## 9.1 WebSocket Event Types

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `trade_event` | Trade entry/exit | tradeId, symbol, mode, trade |
| `portfolio_update` | Balance change | mode, portfolio, tradeId |
| `price_updated` | WebSocket tick | symbol, price, source, mode |
| `trading_pipeline_event` | Engine state change | mode, eventType, message |
| `fx5_scan_complete` | FX5 cycle complete | mode, survivors, metrics |
| `trading_state_changed` | Engine start/stop | mode, isActive |

## 9.2 UI Data Refresh Patterns

```
┌─────────────────────────────────────────────────────────────┐
│                    UI REFRESH PATTERNS                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ACTIVE TRADES TAB                                          │
│  ──────────────────                                         │
│  • Polling: /api/paper-sim/active-trades (every 10s)        │
│  • WebSocket: price_updated (real-time price display)       │
│  • WebSocket: trade_event (new trades, closed trades)       │
│                                                             │
│  TRADE HISTORY TAB                                          │
│  ─────────────────                                          │
│  • On-demand: /api/paper-sim/history (user loads tab)       │
│  • WebSocket: trade_event (append new closed trades)        │
│                                                             │
│  FILTER INSIGHTS TAB                                        │
│  ───────────────────                                        │
│  • WebSocket: fx5_scan_complete (every 30s)                 │
│  • On-demand: /api/stage3/fx5-cache (refresh button)        │
│                                                             │
│  READY TO BUY TAB                                           │
│  ────────────────                                           │
│  • WebSocket: trading_pipeline_event (new signals)          │
│  • Polling: /api/paper-sim/rtb-queue (every 10s)           │
│                                                             │
│  GUARDRAILS TAB                                             │
│  ──────────────                                             │
│  • On-demand: /api/guardrails (user loads tab)              │
│  • On save: PUT /api/guardrails                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 10. Database Schema Summary

## 10.1 Core Trading Tables

```sql
-- paper_sim_trades: All trade records (open + closed)
CREATE TABLE paper_sim_trades (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,           -- 'paper' | 'live'
  symbol VARCHAR NOT NULL,
  strategy VARCHAR NOT NULL,
  status VARCHAR NOT NULL,         -- 'open' | 'closed'
  quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  actual_entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  exit_price NUMERIC,
  actual_exit_price NUMERIC,
  entry_fee NUMERIC,
  exit_fee NUMERIC,
  entry_slippage NUMERIC,
  exit_slippage NUMERIC,
  total_cost NUMERIC,
  gross_pnl NUMERIC,
  net_pnl NUMERIC,
  close_reason VARCHAR,
  confidence NUMERIC,
  volume_24h NUMERIC,
  created_at TIMESTAMP,
  closed_at TIMESTAMP
);

-- paper_sim_open_positions: Currently open positions
CREATE TABLE paper_sim_open_positions (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,
  trade_id INTEGER REFERENCES paper_sim_trades(id),
  symbol VARCHAR NOT NULL,
  quantity NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  strategy VARCHAR,
  created_at TIMESTAMP
);

-- paper_sim_portfolio: Portfolio balance tracking
CREATE TABLE paper_sim_portfolio (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  starting_balance NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  realized_pnl NUMERIC DEFAULT 0,
  engine_start_timestamp TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 10.2 Configuration Tables

```sql
-- guardrails_v2: Risk management settings
CREATE TABLE guardrails_v2 (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,
  portfolio_risk_per_trade_pct NUMERIC,
  symbol_cooldown_minutes INTEGER,
  max_open_positions INTEGER,
  daily_loss_kill_switch_pct NUMERIC,
  kill_switch_tripped BOOLEAN DEFAULT FALSE,
  max_position_percent_pct NUMERIC,
  max_total_exposure_pct NUMERIC,
  is_manual_override BOOLEAN DEFAULT FALSE,
  tuned_by_latti BOOLEAN DEFAULT FALSE,
  locked_by_user JSONB DEFAULT '{}'
);

-- screener_filters: Market scanning filter settings
CREATE TABLE screener_filters (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,
  min_volume NUMERIC,
  min_liquidity NUMERIC,
  min_price NUMERIC,
  max_price NUMERIC,
  rsi_min NUMERIC,
  rsi_max NUMERIC,
  volatility_min NUMERIC,
  volatility_max NUMERIC,
  max_bid_ask_spread NUMERIC,
  passive_learning BOOLEAN DEFAULT FALSE
);

-- execution_attempt_audit: RTB audit log
CREATE TABLE execution_attempt_audit (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL,
  strategy VARCHAR NOT NULL,
  attempt_type VARCHAR NOT NULL,  -- 'signal' | 'execution' | 'blocked'
  result VARCHAR NOT NULL,        -- 'success' | 'blocked'
  block_reason VARCHAR,
  trade_id INTEGER,
  created_at TIMESTAMP
);
```

---

# 11. System Constants & Invariants

## 11.1 Constants Reference

| Constant | Value | File | Line |
|----------|-------|------|------|
| `SLIPPAGE_PERCENT` | 0.15% | `paper-execution-engine.ts` | 95 |
| `FEE_PERCENT` | 0.10% | `paper-execution-engine.ts` | 96 |
| `MONITOR_INTERVAL_MS` | 1,500 | `paper-execution-engine.ts` | 97 |
| `FX5_SCAN_INTERVAL_MS` | 30,000 | `fx5-scanner.ts` | 30 |
| `SIGNAL_EVAL_INTERVAL_MS` | 30,000 | `signal-orchestrator.ts` | 75 |
| `POOL_TTL_MS` | 300,000 | `active-filter-pool.ts` | 20 |
| `RTB_TTL_SECONDS` | 30 | `paper-execution-engine.ts` | 99 |
| `MAX_PRICE_HISTORY` | 100 | `paper-execution-engine.ts` | 98 |
| `CACHE_TTL_MS` | 1,000 | `live-pricing-adapter.ts` | - |

## 11.2 System Invariants

1. **One Position Per Symbol:** Max 1 open position per symbol at any time
2. **Stop-Loss Required:** Every trade must have a stop-loss below entry
3. **Real Prices Only:** No mock pricing in production (B9 integrity)
4. **Mode Isolation:** Paper and live operate in separate pools/engines
5. **TTL Expiry:** Pool entries expire after 5 minutes without refresh
6. **Cost Model:** Total round-trip cost is ~0.50% (slippage + fees)
7. **Balance Semantics:** Guardrails use currentBalance (realized only)
8. **Atomic Updates:** Trade close + balance update happen together

## 11.3 File Reference Index

| Category | File | Purpose |
|----------|------|---------|
| Scanner | `server/services/fx5-scanner.ts` | Market scanning |
| Pool | `server/services/active-filter-pool.ts` | Symbol pool management |
| Orchestrator | `server/services/signal-orchestrator.ts` | Strategy evaluation |
| Strategy | `server/services/strategy-engine.ts` | Strategy detection |
| Sizing | `server/services/paper-position-sizing.ts` | Position sizing |
| Safety | `server/services/trade-safety.ts` | Pre-trade checks |
| Engine | `server/services/paper-execution-engine.ts` | Trade execution |
| Manager | `server/services/paper-portfolio-manager.ts` | Lifecycle management |
| Guardrails | `server/services/guardrail-policy.ts` | Guardrail resolution |
| Pricing | `server/services/live-pricing-adapter.ts` | Price caching |
| WebSocket | `server/services/kraken-websocket-adapter.ts` | Real-time prices |
| Storage | `server/storage.ts` | Database operations |

---

# 12. Validation Framework (Phase 8.8.4)

## 12.1 Overview

Phase 8.8.4 introduces the Extended Calibration & Validation Framework for controlled testing and comparison of VTS (Virtual Trade Simulator) signals against actual paper trade execution.

## 12.2 Validation Services Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           VALIDATION FRAMEWORK (Phase 8.8.4)                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                       M5E VALIDATION SERVICE                                │    │
│  │                    (60-minute Split-Phase Validation)                       │    │
│  │                                                                             │    │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │    │
│  │   │   PHASE A       │  │   PHASE B       │  │   PHASE C       │           │    │
│  │   │   (30 min)      │  │   (30 min)      │  │   (Auto)        │           │    │
│  │   │                 │  │                 │  │                 │           │    │
│  │   │ VTS Simulation  │─▶│ Paper Trading   │─▶│ Comparison &    │           │    │
│  │   │ Only            │  │ Active          │  │ Report Gen      │           │    │
│  │   │                 │  │                 │  │                 │           │    │
│  │   │ tradingActive   │  │ tradingActive   │  │ Generate:       │           │    │
│  │   │   = false       │  │   = true        │  │ • Summary.md    │           │    │
│  │   │                 │  │                 │  │ • Metrics.csv   │           │    │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘           │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                       METRICS CAPTURE (15-second intervals)                 │    │
│  │                                                                             │    │
│  │   • CWQI (Composite Weighted Quality Index)                                │    │
│  │   • NGC (Normalized Global Confidence)                                     │    │
│  │   • DI (Decision Index)                                                    │    │
│  │   • GSI (Global Stability Index)                                           │    │
│  │   • Feed Latency (from price cache timestamps)                             │    │
│  │   • Dynamic Slots (computed from guardrails)                               │    │
│  │   • VTS Trade Count / Paper Trade Count                                    │    │
│  │   • Open Positions Count                                                   │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │                       DYNAMIC SLOT CALCULATION                              │    │
│  │                                                                             │    │
│  │   Formula: maxSlots = floor(maxTotalExposurePct / maxPositionPercentPct)   │    │
│  │                                                                             │    │
│  │   Example: floor(100 / 12) = 8 slots                                       │    │
│  │                                                                             │    │
│  │   File: server/services/dynamic-slots.ts                                   │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 12.3 Validation Criteria

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Feed Latency | < 100ms | Real-time data freshness |
| Cache Window | >= 200 ticks | Price cache depth |
| CWQI/NGC Drift | < 10% | Quality metric stability |
| Adaptive Variance | > 0.01 | Learning activity indicator |
| Risk Per Trade | <= 3.5% | Risk management compliance |
| Max Exposure | <= 40% | Portfolio exposure limit |
| Match Rate | >= 50% | VTS-to-Paper trade matching |
| Calibration Error | < 0.15 | Model accuracy |
| Correlation | > 0.5 | VTS-Paper correlation |

## 12.4 Validation API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/vts/validation/run-m5e` | Full 60-minute M5E validation |
| POST | `/api/vts/validation/run-m5e-vts` | Phase A only (VTS) |
| POST | `/api/vts/validation/run-m5e-paper` | Phase B only (Paper) |
| POST | `/api/vts/validation/run-m5e-compare` | Phase C only (Comparison) |
| GET | `/api/vts/validation/m5e-status` | M5E status check |
| POST | `/api/vts/validation/run-m5d` | M5D validation run |
| GET | `/api/vts/validation/m5d-status` | M5D status check |

## 12.5 Validation Output Files

| File | Location | Description |
|------|----------|-------------|
| Validation Summary | `/docs/Validation_Summary_<sessionId>.md` | Full validation report |
| Metrics CSV | `/docs/Metrics_Trend_Correlation_<sessionId>.csv` | 15-second snapshots |
| Engine Log | `/tmp/logs/ValidationEngine.log` | Engine state log |
| VTS Trades | `/data/vts_trades_*.json` | Virtual trade records |
| Paper Trades | `/data/paper_trades_*.json` | Paper trade records |

## 12.6 Validation Service Files

| File | Purpose |
|------|---------|
| `server/services/m5d-validation-service.ts` | M5D validation orchestration |
| `server/services/m5e-validation-service.ts` | M5E split-phase validation |
| `server/services/dynamic-slots.ts` | Dynamic slot calculation |
| `server/services/vts-live-comparison-audit.ts` | VTS-Paper comparison |
| `server/services/vts-runner.ts` | VTS simulation runner |

---

**Document Version:** 2.0  
**Last Updated:** December 29, 2025
