# Phase 5: Trade Execution & Lifecycle

> **Version**: v1.1 (Phase 5 Addendum applied)
> **Date**: 2026-02-16
> **Author**: Claude Code (System Cartographer)
> **Scope**: Everything that executes trades, manages open positions, handles exits, and tracks the complete trade lifecycle
> **Covers**: Execution Engines, Exit Management, Position Monitoring, Order Timing, Trailing Stops, RTB Promotion, Signal Lifecycle Audit, Mode Registry, Lifecycle Events
> **Files Audited**: 16 files deep-read (~7,000+ lines of core execution code)
> **Addendum**: Kyle's Phase 5 Feedback (2026-02-16): NLAI formally deprecated, TradingEngine deferred, MicroExecutionService accepted as experimental, authoritative scope = paper mode only.
> **Authoritative Execution Path**: `FX5 → SQE → RTB → TCL → PaperExecutionEngine → DSE → TradeSafety → Exit Loop`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dual Execution Engine Architecture](#2-dual-execution-engine-architecture)
3. [PaperExecutionEngine (Primary)](#3-paperexecutionengine-primary)
4. [TradingEngine (Live-Capable)](#4-tradingengine-live-capable)
5. [TrailingExitController](#5-trailingexitcontroller)
6. [MicroExecutionService](#6-microexecutionservice)
7. [ModeRegistry & Engine Instance Management](#7-moderegistry--engine-instance-management)
8. [Lifecycle Events Service](#8-lifecycle-events-service)
9. [Signal Lifecycle Audit Layer (SLAL)](#9-signal-lifecycle-audit-layer-slal)
10. [Execution Timing Service](#10-execution-timing-service)
11. [Trade Flow Types (Directive 11.0B)](#11-trade-flow-types-directive-110b)
12. [Execution Configuration](#12-execution-configuration)
13. [TradeBob (Cache Layer)](#13-tradebob-cache-layer)
14. [Execution Policy Controller (Walter/NLAI)](#14-execution-policy-controller-walternlai)
15. [NLAI Execution Broker](#15-nlai-execution-broker)
16. [Unified Price Cache](#16-unified-price-cache)
17. [Paper Simulation Service](#17-paper-simulation-service)
18. [Exit Condition Architecture](#18-exit-condition-architecture)
19. [RTB Promotion Pipeline](#19-rtb-promotion-pipeline)
20. [Cross-References](#20-cross-references)
21. [Critical Findings](#21-critical-findings)
22. [Forward Audit Standard Checks](#22-forward-audit-standard-checks)
23. [File Catalog](#23-file-catalog)
24. [Revision History](#24-revision-history)

---

## 1. Architecture Overview

DawnTrader's trade execution operates through a **dual-engine architecture** with clearly separated responsibilities for paper and live trading. The system has evolved organically, with the PaperExecutionEngine becoming the dominant, actively-maintained engine (~2,308 lines) while the TradingEngine (~766 lines) retains live-mode capabilities but contains significant placeholder code.

### High-Level Execution Flow

```
Signal Source (FX5 → SignalOrchestrator → SQE → RTB → TCL)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  EXECUTION ENGINE LAYER                              │
│                                                      │
│  PaperExecutionEngine (paper mode — PRIMARY)         │
│  ├── processSignal() → guardrails → expectancy gate  │
│  ├── executeSimulatedTrade() → sizing → DB write     │
│  ├── monitoringCycle() (1.5s loop)                   │
│  │   └── checkOpenPositions() → exit evaluation      │
│  └── checkRtbPromotion() → multi-signal promotion    │
│                                                      │
│  TradingEngine (live mode — SECONDARY)               │
│  ├── processSignal() → guardrails → ⚠ Goal Align    │
│  ├── executeTrade() → Kraken API                     │
│  │   ⚠ Contains SIMULATED partial fills (Math.random)│
│  │   ⚠ Contains SIMULATED slippage (Math.random)     │
│  └── placeStopAndTargetOrders() → bracket orders     │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  EXIT MANAGEMENT LAYER                               │
│                                                      │
│  TrailingExitController (Directive 9.2.A)            │
│  ├── Two-stage latch: Break-Even → Target Lock       │
│  ├── Cost-aware floors (Directive 11.3A)             │
│  └── Dynamic trailing: K' from DI + VolNoise         │
│                                                      │
│  MicroExecutionService (paper-mode only)             │
│  ├── 8s recheck loop, 0.30% delta trigger            │
│  └── ⚠ triggerSymbolCheck() is TODO stub             │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  OBSERVABILITY & INFRASTRUCTURE                      │
│                                                      │
│  ModeRegistry — engine instances, telemetry broadcast│
│  LifecycleEvents — signalValidated/readyToTrade/exec │
│  SLAL — 7-stage signal lifecycle audit               │
│  ExecutionTimingService — order timing marks          │
│  TradeBob — trade data cache (1s TTL)                │
│  UnifiedPriceCache — multi-bucket price management   │
└──────────────────────────────────────────────────────┘
```

### Canonical Signal-to-Trade Pipeline

The canonical trade flow (from Phase 3 scanning through execution) is:

```
FX5 (30s scans) → SignalOrchestrator (exposure/correlation/cooldown)
    → SQE (FinalScore + RegimeWeight)
    → Ready-to-Buy Queue (30s refresh, TTL=30s)
    → TCL (ranking by FinalScore, 2-min or 15-signal trigger)
    → PaperExecutionEngine.processSignal()
    → executeSimulatedTrade() (guardrails → EV gate → sizing → DB)
```

**Deprecated methods removed by Directive 8.8.4-A3.R9.3:**
- `scanForSignals()` — removed
- `checkSymbolForSignal()` — removed
- `injectForcedTrade()` — removed

All signal generation now flows exclusively through the FX5 → RTB → TCL pipeline.

---

## 2. Dual Execution Engine Architecture

### The Two Engines

| Property | PaperExecutionEngine | TradingEngine |
|----------|---------------------|---------------|
| **File** | `paper-execution-engine.ts` | `trading-engine.ts` |
| **Lines** | ~2,308 | ~766 |
| **Primary Mode** | Paper | Live + Paper |
| **Monitoring** | 1.5s cycle with re-entrancy guard | `monitorActiveTrades()` via strategyEngine |
| ⛔⛔ **Monitoring — CORRECTED 2026-08-29 (`#928`-adjacent, F-G-2 Step-2 FINDING A1; Langston found this row)** | — | ⛔ **`monitorActiveTrades()` IS DEAD. IT HAS ZERO CALLERS.** Presence-evidenced repo-wide, tests excluded: `monitorActiveTrades` appears exactly ONCE — its own definition at `trading-engine.ts:677`. The whole limb is dead end-to-end: `:677` (no callers) → `checkTradeExitConditions:688` (sole caller `:684`) → `strategy-engine.checkExitConditions:1106` (sole caller `trading-engine:696`) → the `:1123-1138` switch → six per-strategy exit helpers `:1151-1199`, one caller each. ⚠️ **THE ROW ABOVE READ AS LIVE AND IS EXACTLY THE ARTIFACT A FUTURE SESSION WOULD TRACE FORWARD FROM AND RE-WIRE** — it is a SEPARATE exit implementation that never imports `evaluateTECExit` and reads a THIRD price source (`kraken.getTicker(symbol).c[0]`, the v1 REST ticker). **Re-wiring it would bypass everything `F-G-2` does.** **Homed: `PHASE_19_PLAN` 3h as a NAMED item; its disposition is decidable WITHOUT 3h's verdict on the HTTP intent path.** |
| **Exit Logic** | Direct SL/TP/trailing/max hold checking | Delegates to `strategyEngine.checkExitConditions()` |
| **RTB Promotion** | Full multi-signal promotion (C.14.B) | None |
| **Pricing** | WebSocket priority + REST fallback | Direct Kraken REST |
| **P/L Breakdown** | Full C2 directive (gross/net/costs) | Basic (no cost breakdown) |
| **Expectancy Gate** | Yes (Directive 11.8B) | No |
| **SLAL Integration** | Yes | No |
| **Goal Alignment** | No (removed) | ⚠ **YES — still active** (lines 246-254) |
| **Partial Fills** | Not applicable (paper) | ⚠ **SIMULATED** with Math.random() |
| **Status** | **ACTIVE, primary engine** | **Secondary, contains placeholder code** |

### Key Asymmetry: Goal Alignment

The PaperExecutionEngine does NOT contain Goal Alignment logic (it was architecturally removed). However, the TradingEngine still computes and applies `goalAlignmentScore`:

```typescript
// TradingEngine, line 249:
signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
```

This is a **SECOND location** of Goal Alignment beyond `pre-execution-validator.ts` (identified in Phase 4). Kyle's deprecation directive covers pre-execution-validator.ts, but this TradingEngine location also needs removal.

---

## 3. PaperExecutionEngine (Primary)

**File**: `server/services/paper-execution-engine.ts` (~2,308 lines)
**Directive**: 11.0E (FinalScore Unification)
**Class**: `PaperExecutionEngine`

### 3.1 Configuration Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SLIPPAGE_PERCENT` | 0.15% | Simulated entry/exit slippage |
| `FEE_PERCENT` | 0.10% | Simulated trading fee (both sides) |
| `MONITOR_INTERVAL_MS` | 1,500ms | Position check frequency |
| `MAX_PRICE_HISTORY` | 100 | Candle history per symbol |
| `RTB_TTL_SECONDS` | 30 | RTB signal expiry time |
| `CONTINUOUS_PROMOTION_INTERVAL_MS` | 30,000ms | RTB promotion loop interval |

### 3.2 Lifecycle: start()

The `start()` method initializes a comprehensive suite of subsystems:

1. **Idempotency guard** (Directive 8.8.4-A3.R9.0.B) — skips if already running
2. **LivePricingAdapter** — sets trading mode for WebSocket broadcasts
3. **Session timestamp** — sets `engineSessionStart` for RTB metrics
4. **AJ17/AJ18 diagnostics** — starts diagnostic sessions
5. **Kraken WebSocket** — starts adapter, sets I8C open positions provider
6. **I8C subscription** — subscribes ALL open position symbols on start
7. **RTB service** — cleans expired signals, starts 30s refresh cycle, sets engine start time
8. **TCL Watchdog** — starts with event-driven activation (2-min failsafe)
9. **Event listeners** — binds TCL_ACTIVATED and TRADE_CLOSED handlers
10. **Continuous promotion loop** (Directive 8.8.8) — 30s RTB promotion checks
11. **Covariance engine** (Directive 9.4) — loads OHLC for top 20 symbols, computes initial correlation matrix
12. **Monitoring interval** — starts 1.5s `monitoringCycle()`

### 3.3 Lifecycle: stop()

Mirrors start() in reverse:
1. Clears `isRunning`, cancels monitoring interval
2. Clears session start (zeroes RTB metrics)
3. Stops AJ17 diagnostics
4. Stops RTB refresh cycle and clears engine start time
5. Stops TCL Watchdog
6. Unbinds event listeners (includes stopping continuous promotion loop)
7. Stops I8C subscription audit
8. Stops Kraken WebSocket adapter

### 3.4 Monitoring Cycle

```typescript
monitoringCycle() // Every 1.5 seconds
  ├── Re-entrancy guard (isCycleRunning flag)
  ├── Skip if engine stopped
  ├── Track cycle timestamp (lastCycleAt)
  ├── Log ENGINE_TICK with position count
  ├── checkOpenPositions()  // Exit evaluation
  └── Note: Signal scanning REMOVED (Directive 8.8.4-A3.R9.3)
```

### 3.5 Position Exit Evaluation: checkOpenPositions()

For each open position:

1. **Price acquisition** — WebSocket cache first (2s stale threshold), REST fallback
2. **Mock price rejection** (Phase B9) — skips if price source is 'mock'
3. **Price tick logging** — ring buffer of last 100 ticks for cadence verification
4. **P/L calculation** — updates position with unrealized P/L
5. **Exit condition check** — calls `checkExitConditions()`
6. **Close if triggered** — calls `closePosition()` with full P/L breakdown

**Price source statistics tracked per cycle**: wsPrice, restPrice, withoutPrice, slHits, tpHits

### 3.6 Exit Conditions

The engine checks four exit conditions in order:

| Exit Type | Condition | Priority |
|-----------|-----------|----------|
| `target_hit` | `currentPrice >= takeProfit` | 1st |
| `stop_hit` | `currentPrice <= stopLoss` | 2nd |
| `trailing_stop_hit` | `currentPrice <= trailingStopPrice` (from metadata HWM) | 3rd |
| `max_holding_period` | `hoursHeld >= maxHours` (from metadata) | 4th |

### 3.7 Position Close: closePosition()

Implements Phase 8.8.3-C2 P/L breakdown:

```
Gross P/L = (exitPrice - intendedEntryPrice) × quantity
Total Cost = entryFee + exitFee + entrySlippage + exitSlippage
Net P/L   = Gross P/L - Total Cost
```

On close, the engine:
1. Computes full C2 cost breakdown
2. Applies B8.PNL anomaly guard (>100% move in <5 min)
3. Updates trade record with all cost fields
4. Logs exit event with C2 breakdown
5. Records VTS comparison audit (Directive M5C.1)
6. Logs AJ19-B close event with slot counts
7. Deletes open position
8. Unsubscribes WebSocket
9. Captures data for learning aggregation (Directive 8.8.4-L1)
10. Runs C5 P/L sanity check and balance reconciliation
11. Emits TRADE_CLOSED event (triggers RTB promotion)

### 3.8 Signal Processing: processSignal()

This is called from RTB promotion (`executePromotedSignal`). Flow:

1. Governance checks (strategy eligibility, mode resolution)
2. Regime stability check
3. Confidence floor check per strategy mode
4. Duplicate position guard (I7-PM-FOCUS C1) — **moved BEFORE trade creation**
5. Forward to `executeSimulatedTrade()`

### 3.9 Trade Execution: executeSimulatedTrade()

1. **Guardrail check** — `checkGuardrailRisk()` with pre-computed notional
2. **Net Expectancy Gate** (Directive 11.8B) — positive EV required
3. **Position sizing** — pre-sized quantity from P2 (paper) or fallback calculation
4. **Slippage/fee application** — SLIPPAGE_PERCENT + FEE_PERCENT
5. **Trade creation** — DB write with full cost metadata
6. **Position creation** — open position record
7. **WebSocket subscription** — subscribe to new symbol
8. **Trailing state initialization** (Directive 9.2.A)
9. **SLAL completion event** — records COMPLETED stage

### 3.10 Session Reset: resetSessionState()

Phase 8.8.3-B7.A hard reset clears all in-memory state:
- Running flags, monitoring interval
- Price history cache
- Session start timestamp (zeroes RTB metrics)
- Price tick diagnostics
- WebSocket subscriptions
- AJ17 diagnostics
- RTB refresh cycle

---

## 4. TradingEngine (Live-Capable) — DEFERRED (Kyle, 2026-02-16)

**File**: `server/services/trading-engine.ts` (~766 lines)
**Class**: `TradingEngine`
**Status**: ⏸️ **DEFERRED** — live mode is not in scope for architectural validation. Paper mode is authoritative.

> **Kyle's Decision (Phase 5 Addendum)**: TradingEngine currently uses legacy signal orchestration, contains simulated fills, includes goal alignment logic, and does not mirror paper execution core. **Defer refactor until paper mode is fully stable.** Future strategic fork: (A) Refactor trading-engine to mirror paper core, or (B) Delete and rebuild live engine from paper core. No action required now.
>
> **Scope note**: All BUG/RISK items in this section related to TradingEngine live-mode placeholder code (BUG-010, BUG-011, RISK-036) are **informational only** at this stage. They document known deficiencies that must be addressed before live trading, but are non-blocking for the current paper-mode-authoritative architecture.

### 4.1 Architecture

The TradingEngine is the **live-capable** execution engine. It:
- Manages a `SignalOrchestrator` for automatic signal generation (30s interval, 9 strategies)
- Processes signals through guardrails and slippage tolerance checks
- Executes trades via Kraken API for live mode
- Places bracket orders (stop-loss + take-profit) after live trade execution
- Monitors active trades via `strategyEngine.checkExitConditions()`

### 4.2 ⚠ CRITICAL: Goal Alignment Still Active

The TradingEngine computes Goal Alignment scores and applies them to FinalScore:

```typescript
// Lines 247-249:
const goalAlignmentScore = await this.calculateGoalAlignmentScore(signal, this.mode);
signal.goalAlignmentScore = goalAlignmentScore;
signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
```

**The `calculateGoalAlignmentScore()` method** (lines 128-226):
- Reads `profitability_vs_consistency` goal (1-10 scale)
- Computes risk/reward alignment (40% weight)
- Computes strategy risk profile alignment (30% weight)
- Computes signal confidence alignment (30% weight)
- Only covers 3 strategy profiles: `vwap_pullback`, `abcd_long`, `sma_trend_ride`

This is the **SECOND active location** of Goal Alignment. Kyle's deprecation directive in Phase 4 targeted `pre-execution-validator.ts`. This location needs to be added to the deprecation scope.

### 4.3 ⚠ CRITICAL: Simulated Partial Fills in Live Mode

Lines 346-388 of `executeTrade()` simulate partial fills using `Math.random()`:

```typescript
// Line 347:
const isPartialFill = Math.random() < 0.1; // 10% chance
const fillPercent = 50 + Math.random() * 39; // 50-89%
```

The comment says *"In a real implementation, we'd query the order status to get actual filled quantity"*. This is **placeholder code** that would cause incorrect quantity tracking in production live trading.

### 4.4 ⚠ Simulated Slippage/Fees in Live Mode

Lines 391-393 apply simulated costs even in live mode:

```typescript
entrySlippage = Math.random() * 0.1; // 0-0.1% slippage
entryFee = (actualEntryPrice * filledQuantity) * 0.0026; // Kraken taker fee
```

Live mode should derive actual slippage from fill price vs. signal price, and actual fees from Kraken API response.

### 4.5 Bracket Order Placement

For live trades, `placeStopAndTargetOrders()` places:
1. **Stop-loss** — `stop-loss` order with configurable buffer (default 5%)
2. **Take-profit** — `limit` sell order at target price

Includes **rollback logic**: if any bracket order fails, previously placed orders are cancelled. This is well-designed.

### 4.6 Trade Close

`closeTrade()`:
1. Cancels existing stop and target orders
2. Executes market sell order (live) or simulates (paper)
3. ⚠ Uses `Math.random() * 0.1` for exit slippage even in live mode
4. Records telemetry events

### 4.7 EngineSettingsBus

Hot-reload pub/sub for strategy settings changes. Subscribers can receive mode-based reload notifications. Used to propagate guardrail changes to running engines.

---

## 5. TrailingExitController

**File**: `server/services/trailing-exit-controller.ts` (~335 lines)
**Directives**: 9.2.A (Dynamic Trailing Exit), 11.3A (Cost-Aware Ratchet)

### 5.1 Two-Stage Latch System

The TrailingExitController implements a sophisticated two-stage exit system:

```
Stage 0: TARGET mode (initial)
  │  Price gains 1×ATR above entry
  ▼
Stage 1: BREAK-EVEN LATCHED
  │  Stop moves to netBreakeven (cost-aware)
  │  Dynamic trailing from HWM begins
  │  Price reaches target price
  ▼
Stage 2: TARGET LATCHED → TRAILING_TAKE mode
  │  Stop locks to netTargetFloor (cost-aware)
  │  "MOONBAG" mode activated
  │  Dynamic trailing continues from HWM
  └──> shouldClosePosition() returns true when price <= currentStopPrice
```

### 5.2 Cost-Aware Floors (Directive 11.3A)

Traditional trailing stops use gross prices. Directive 11.3A uses **net-aware floors** that account for execution costs:

- `netBreakeven = computeNetBreakeven(entryPrice, costMetrics)` — accounts for entry/exit fees and slippage
- `netTargetFloor = computeNetTargetFloor(targetPrice, costMetrics)` — ensures profit target accounts for costs

These floors are imported from `core/math/cost-model.ts`.

### 5.3 Dynamic Trailing Stop Calculation

```
K' = calculateDynamicStopDistance(DI, VolNoise)
TrailingStopPrice = calculateTrailingStopPrice(HWM, ATR, DI, VolNoise)
FinalStop = max(floorStop, dynamicStop)
```

Where:
- `HWM` = high water mark (tracks maximum price since entry)
- `ATR` = average true range
- `DI` = directional integrity
- `VolNoise` = volatility noise estimate

### 5.4 State Management

- **In-memory**: `Map<string, TrailingState>` keyed by symbol
- **Persistence**: Debounced writes (5s) to `/tmp/trailing-states.json` via `schedulePersistence()`
- **DB sync**: On mode change, `syncTradeModeToStorage()` updates the trade mode in the database
- **Export/Import**: `exportAllStates()` and `importStates()` for persistence

### 5.5 Interface: TrailingState

```typescript
interface TrailingState {
  symbol: string;
  tradeMode: TradeMode;        // 'TARGET' | 'TRAILING_TAKE'
  entryPrice: number;
  targetPrice: number;
  currentStopPrice: number;
  highWaterMark: number;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  lastUpdated: number;
  DI: number;
  VolNoise: number;
  ATR: number;
}
```

---

## 6. MicroExecutionService — Experimental/Dormant (Kyle Accepted, 2026-02-16)

**File**: `server/services/micro-execution-service.ts` (~374 lines)
**Phase**: 27.F.14.MICRO
**Status**: 🟡 **Experimental, dormant, non-interfering** — leave hidden per Kyle. Revisit only if micro-price trading becomes intentional.

### 6.1 Purpose

Lightweight high-frequency loop that re-checks Ready-to-Buy pairs between main monitoring cycles. Triggers execution when price moves significantly.

### 6.2 Safety Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `intervalMs` | 8,000ms | Check frequency |
| `priceDeltaTrigger` | 0.30% | Minimum price change to trigger |
| `COOLDOWN_MS` | 15,000ms | Per-symbol cooldown |
| `MAX_EXECUTIONS_PER_MINUTE` | 5 | Rate limit |
| `STABILITY_WINDOW_MS` | 3,000ms | Price stability requirement |

### 6.3 Key Behaviors

- **Paper-mode only** — `start()` returns immediately if `mode === 'live'`
- **Configuration** — loaded from `guardrails_v2` but uses hardcoded defaults for micro-specific params
- **Price tracking** — via `updatePrice()` from WebSocket feed
- **Watchlist scanning** — reads from `storage.getWatchlist()` for RTB pairs

### 6.4 ⚠ triggerSymbolCheck() Is a TODO Stub

The method that should actually trigger execution is unimplemented:

```typescript
// Line ~250 (approximate):
console.log(`[MicroLoop] Would trigger execution check for ${symbol}`);
```

This means the MicroExecutionService **detects price movements but cannot act on them**. It logs that a check should happen but does not call the execution engine. Not blocking (the main 1.5s monitoring loop handles execution), but the service is incomplete.

---

## 7. ModeRegistry & Engine Instance Management

**File**: `server/services/mode-registry.ts` (~162 lines)
**Phase**: 27.F.15.B.4 (Production Telemetry)

### 7.1 Runtime Legacy Guard

At module load time, ModeRegistry blocks legacy engine usage:

```typescript
if ((global as any).PaperExecutionServiceLegacy) {
  throw new Error('[B9][FATAL] Legacy PaperExecutionService is not supported...');
}
```

### 7.2 Engine Instance Registry

Stores global references to engine instances per mode:

- `registerEngine(mode, engine)` — stores PaperExecutionEngine reference
- `getEngine(mode)` — retrieves engine for a mode
- `registerMicroService(mode, service)` — stores MicroExecutionService reference
- `getMicroService(mode)` — retrieves micro service for a mode

### 7.3 Mode Status Tracking

```typescript
interface ModeStatus {
  engineStatus: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  riskSummary: Record<string, any>;
  alerts: number;
  trades: number;
  lastUpdate: Date;
}
```

Status changes are broadcast via `contextBridge` for real-time UI updates.

---

## 8. Lifecycle Events Service

**File**: `server/services/lifecycle-events.ts` (~177 lines)
**Directive**: REB 2.12D Part A

### 8.1 Three Lifecycle Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `signalValidated` | Signal passes all validation checks | mode, symbol, strategy, confidence, validation details |
| `readyToTrade` | Signal approved and ready for execution | mode, symbol, strategy, entry/stop/target, quantity, risk |
| `paperTradeExecuted` | Paper trade successfully executed | tradeId, positionId, symbol, strategy, prices, costs |

All events:
- Add ISO timestamp
- Increment internal counters
- Broadcast via `contextBridge` (type: 'trade_event')
- Record telemetry metric ('signal_emit')

---

## 9. Signal Lifecycle Audit Layer (SLAL)

**File**: `server/core/audit/signal_lifecycle_audit.ts`
**Phase**: 8.8.4-A

### 9.1 Seven Lifecycle Stages

```
GENERATION → SIZING → VALIDATION → QUEUED → PROMOTED → EXECUTION → COMPLETED/REJECTED
```

### 9.2 Fourteen Rejection Reasons

| Reason | Description |
|--------|-------------|
| `INVALID_SIGNAL` | Malformed signal (missing fields) |
| `ZERO_SIZE` | Sizing returned 0 quantity |
| `GUARDRAIL_BLOCKED` | Risk guardrail rejected |
| `MAX_POSITIONS` | Max open positions reached (legacy alias) |
| `MAX_TRADES` | Max simultaneous open trades limit |
| `SLOT_CONFLICT` | Post-guardrail slot capacity overflow |
| `DAILY_LOSS_LIMIT` | Kill switch triggered |
| `SYMBOL_COOLDOWN` | Symbol on cooldown |
| `POSITION_CAP` | Position size cap exceeded |
| `DUPLICATE_POSITION` | Already have position in symbol |
| `EXECUTION_FAILED` | Trade execution failed |
| `EXPIRED_SIGNAL` | Signal TTL expired |
| `NO_PRICE` | Could not get reliable price |
| `SQE_QUALITY_REJECT` | Failed SQE quality thresholds |

### 9.3 Signal Journey Tracking

Each signal gets a `SignalJourney` with:
- 30-minute TTL
- Maximum 5,000 concurrent journeys
- 10,000 event history ring buffer
- Strategy-level breakdown metrics
- Success rate tracking

### 9.4 SLAL Metrics

Exposes comprehensive metrics including:
- Signals generated/sized/validated/executed/completed/rejected
- Rejections by reason and by stage
- Average generation-to-completion time
- Per-strategy success rates

---

## 10. Execution Timing Service

**File**: `server/services/execution-timing.ts` (~274 lines)

### 10.1 Timing Marks

Tracks four critical timestamps per order:

```
t_decide → t_submit → t_ack → t_fill
```

### 10.2 Computed Metrics

- `submit_ack_ms` — time from order submission to exchange acknowledgement
- `ack_fill_ms` — time from acknowledgement to fill
- `total_ms` — end-to-end execution time
- `slippage_bps` — slippage in basis points

### 10.3 Storage

- 1,000-order history ring buffer
- CSV export capability for external analysis

---

## 11. Trade Flow Types (Directive 11.0B)

**File**: `server/types/trade-flow.ts` (~127 lines)

### 11.1 Type Definitions

| Type | Purpose |
|------|---------|
| `TradeSignal` | Signal from strategy engine |
| `ExecutionIntent` | Intent to execute a trade |
| `ExitDecision` | Whether to exit a position |
| `ActiveTrade` | Currently open trade |
| `TradeOrder` | Order submitted to exchange |
| `AdaptiveSizeResult` | Position size adjustment |
| `TradeExecutionController` | TEC interface contract |
| `Trendline` | Feedback for adaptive sizing |

### 11.2 ⚠ StrategyType Mismatch

The `StrategyType` union type lists only **9 strategies**:

```typescript
type StrategyType = 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride'
  | 'breakout' | 'mean_reversion' | 'range_trading'
  | 'vwap_bounce' | 'liquidity_trap' | 'dhma';
```

The canonical system defines **17 strategies** (5 quant + 5 pattern + 5 hybrid + 2 special). This mismatch means 8 strategy types cannot be properly typed through the trade flow layer. This is consistent with BUG-002/BUG-003 (DSS/SignalOrchestrator use legacy 9-strategy map) but creates an additional enforcement point for the strategy type mismatch.

### 11.3 Trade Lifecycle Flow Documentation

The file header documents the canonical flow:

```
[Signal Orchestrator] (exposure, correlation, cooldown)
     ↓
[SQE] (FinalScore + RegimeWeight)
     ↓
[Ready-to-Buy Queue] (2-min or 15-signal trigger)
     ↓
[TCL] (FinalScore ranking)
     ↓
[TEC] (adaptive sizing + trailing exits)
     ↓
[Order Management]
```

---

## 12. Execution Configuration

**File**: `server/config/execution-config.ts` (~23 lines)
**Directive**: 11.0C

### 12.1 TEC Parameters

```typescript
EXECUTION_CONFIG = Object.freeze({
  ADAPTIVE_EXPAND_FACTOR: 1.10,      // Expand position by 10%
  ADAPTIVE_CONTRACT_FACTOR: 0.90,     // Contract position by 10%
  TRAILING_STOP_BASE: 0.015,          // 1.5% base trailing stop
  TRAILING_STOP_ACCELERATION: 0.002,  // Acceleration factor
  MAX_POSITION_RISK: 0.02,            // 2% max position risk
  TRAILING_STOP_ACTIVATION_PCT: 1.0,  // Activation at 1% gain
  TRAILING_STOP_DISTANCE_PCT: 0.5,    // Distance at 0.5%
  MAX_HOLDING_PERIOD_MS: 86400000,    // 24 hours
  VERSION: "v1.0.0"
});
```

**Note**: `MAX_POSITION_RISK: 0.02` (2%) was flagged in Phase 4 as RISK-031 and deferred by Kyle.

---

## 13. TradeBob (Cache Layer)

**File**: `server/services/bob-trade.ts` (~252 lines)
**Phase**: 27.F.15.A

### 13.1 Purpose

TradeBob is a cache layer for trade data with a 1-second TTL. It sits between API consumers and the database, reducing query load for frequently-accessed trade data.

### 13.2 Key Behaviors

- **1-second TTL** — cache expires after 1s, forcing fresh DB reads
- **Event-driven invalidation** — trade changes trigger cache clear
- **Global scope** — Phase 27.F.15.A: no userId filtering for trades (mode-based only)
- **BobCore integration** — extends the BobCore caching framework

---

## 14. Execution Policy Controller — LEGACY (Kyle Confirmed, 2026-02-16)

**File**: `server/services/execution-policy-controller.ts` (~309 lines)
**Phase**: 22 (NLAI Autonomy)
**Status**: 🔴 **LEGACY — Formally deprecated with NLAI system (Kyle, 2026-02-16)**

### 14.1 Purpose (Historical)

The ExecutionPolicyController was the **Walter/NLAI approval layer** for autonomous actions. It checked whether an NLAI agent had permission to execute specific actions based on user-configured approval matrices.

### 14.2 Approval Flow (Historical)

```
NLAI Action Request
    → Check user permissions
    → Map action to approval key (e.g., 'update_risk_per_trade' → 'modifyGuardrails')
    → Check approval matrix
    → Calculate projected risk
    → Create execution log
    → Approve or create pending approval record
```

### 14.3 Kyle's Deprecation Decision

**Phase 5 Addendum (Kyle, 2026-02-16)**: NLAI is formally deprecated as legacy conversational control infrastructure.

**What NLAI was**: The Natural Language Action Interpreter — Walter AI's command bridge. It parsed chat commands, routed them through the execution broker, called the same service functions UI buttons call (guardrails, goals, watchlist, start/stop trading), and published events.

**What NLAI did NOT do**: It did NOT inject signals, modify scoring, alter VTS, or override execution math. It was architecturally safe and scoped — but no longer aligned with system direction.

**Why deprecated**: Walter has been deprecated. Conversational goal system removed. Goals tab removed. System now operates via deterministic UI and services. NLAI is legacy conversational control infrastructure.

**Removal scope** (Kyle directive):
- `nlai-interpreter.ts`
- `contextual-nlai-interpreter.ts`
- `nlai-execution-broker.ts`
- `nlai-action-registry.ts`
- ExecutionPolicyController approval hooks (if exclusively used by NLAI)
- NLAI-related cluster bus events
- NLAI-related routes
- Goal-update command handlers
- Any residual Walter-specific context logic

**Note**: Future ML integration may reintroduce command routing, but that will be deliberate and redesigned.

### 14.4 Conditional Removal: ExecutionPolicyController

Kyle's directive: *"If ExecutionPolicyController is used solely as NLAI approval gate: Remove with NLAI. If it also controls execution style within PaperExecutionEngine: Simplify to static behavior."*

**Audit finding**: ExecutionPolicyController is imported only by NLAI-related modules (nlai-execution-broker). It does NOT control execution behavior within PaperExecutionEngine.

**Verdict**: Remove with NLAI.

---

## 15. NLAI Execution Broker — LEGACY (Kyle Confirmed, 2026-02-16)

**File**: `server/services/nlai-execution-broker.ts` (~477 lines)
**Status**: 🔴 **LEGACY — Remove with NLAI system**

### 15.1 Purpose (Historical)

Dispatched NLAI actions through the ExecutionPolicyController for approval, then executed approved actions through `nlaiActionRegistry`.

### 15.2 Key Features (Historical)

- **30-second execution timeout** per action
- **100-order execution log** ring buffer
- **`dispatchMultiple()`** — sequential multi-intent execution
- **Cluster bus events** — emits coordination events for other services
- **Conversational filter** — filters out conversational intents before dispatch

### 15.3 Deprecation Verdict

**LEGACY** — deprecated with entire NLAI system per Kyle (2026-02-16). Remove alongside all NLAI files listed in Section 14.3.

---

## 16. Unified Price Cache

**File**: `server/services/price-cache.ts` (~448 lines)
**Directive**: 8.8.4-A4.R10R-4 (Core System Hardening)
**Status**: 🔒 **LOCKED MODULE** — changes require formal directive

### 16.1 Priority Buckets

| Bucket | Refresh Interval | Purpose |
|--------|-----------------|---------|
| `openTrade` | 2,000ms | Active position monitoring |
| `readyToBuy` | 15,000ms | RTB candidate pricing |
| `fx5Snapshot` | 30,000ms | Scanning/analysis |
| `vtsSimulation` | 60,000ms | VTS cache sandbox (Directive 11.0E.2) |

### 16.2 Rate Governance

- Maximum 10 weighted requests per second to Kraken API
- Batch size: 100 symbols per API call
- Weight budget with retry logic (max 20 retries, 250ms delay)
- Health logging every 60 seconds

### 16.3 Key Methods

- `subscribe(symbol, bucketType)` — add symbol to a bucket
- `unsubscribe(symbol)` — remove from all buckets
- `getPrice(symbol, bucketType)` — get cached or fetch fresh
- `getBatch(bucketType, symbols)` — batch retrieval for FX5
- `updateFromWebSocket(symbol, price)` — inject WS prices
- `updateFromRest(symbol, price)` — inject REST prices

---

## 17. Paper Simulation Service

**File**: `server/services/paper-sim-service.ts`

### 17.1 Session Management

Manages paper simulation sessions with:
- **Idempotent start/stop** — database as single source of truth
- **Stale busy flag auto-clear** — 10-second threshold
- **Orphaned manager detection** — cleanup of abandoned sessions
- **Balance confirmation** — 24-hour staleness check

---

## 18. Exit Condition Architecture

DawnTrader's exit management operates through multiple layers:

### 18.1 Exit Hierarchy

```
Layer 1: PaperExecutionEngine.checkExitConditions()
  │  Checks: target_hit, stop_hit, trailing_stop_hit, max_holding_period
  │  Frequency: Every 1.5 seconds
  │
Layer 2: TrailingExitController.updatePosition()
  │  Checks: break-even latch, target latch, dynamic trailing
  │  Updates: stop price based on HWM, DI, VolNoise, ATR
  │  Triggers: shouldClosePosition() when price <= currentStopPrice
  │
Layer 3: MicroExecutionService.microCheck()
  │  Checks: price delta trigger on RTB pairs
  │  Frequency: Every 8 seconds (paper mode only)
  │  ⚠ Status: triggerSymbolCheck() is TODO stub
  │
Layer 4: Kill Switch (from Phase 4)
  │  Triggers: daily_loss_kill_switch_pct exceeded
  │  Effect: Emergency shutdown of all trading
```

### 18.2 Exit Close Reason Mapping

```typescript
const closeReasonMap = {
  'stop_hit': 'SL',
  'target_hit': 'TP',
  'trailing_stop_hit': 'TRAILING_STOP',
  'max_holding_period': 'UNKNOWN',  // ← Could be improved
  'guardrail': 'KILL_SWITCH',
  'manual_stop': 'MANUAL'
};
```

---

## 19. RTB Promotion Pipeline

### 19.1 Event-Driven Promotion

RTB promotion is triggered by three mechanisms:

1. **TCL_ACTIVATED event** — when TCL watchdog confirms readiness
2. **TRADE_CLOSED event** — when capacity is freed by a closing trade
3. **Continuous promotion loop** (Directive 8.8.8) — 30-second timer checks

### 19.2 Multi-Signal Promotion (Phase C.14.B)

```
checkRtbPromotion()
  ├── Check TCL active via tclWatchdog
  ├── Calculate openSlots = maxTrades - openPositions
  ├── Get rankedSignals (up to openSlots count)
  └── For each signal:
        ├── Check FinalScore >= 0.35 (MIN_FINAL_SCORE)
        ├── Remove from RTB queue FIRST (Directive A3.R1)
        ├── executePromotedSignal() → processSignal()
        ├── If success: update signal with tradeId, emit PROMOTION event
        └── If fail: signal already removed, not restored (⚠ potential issue)
```

### 19.3 ⚠ Failed Promotion Not Restored

When `executePromotedSignal()` fails, the signal has already been removed from the RTB queue (Step 1 of Directive A3.R1) but is NOT restored. The code explicitly acknowledges this:

```
console.warn('[8.8.4-A3.R1][PROMOTION_ORDER] Signal was removed from RTB but trade failed - signal not restored');
```

This is a design trade-off to prevent double-activation, but means failed promotions lose signals permanently.

---

## 20. Cross-References

| This Section | Related To | Connection |
|-------------|------------|------------|
| PaperExecutionEngine | Phase 3 (Signal Orchestrator) | Receives signals via RTB → TCL → processSignal() |
| PaperExecutionEngine | Phase 4 (Trade Safety) | Calls `checkGuardrailRisk()` before execution |
| PaperExecutionEngine | Phase 4 (Guardrails V2) | Reads guardrails for position limits, kill switch |
| TrailingExitController | Phase 4 (Cost Model) | Uses `computeNetBreakeven()`, `computeNetTargetFloor()` |
| TradingEngine Goal Alignment | Phase 4 §7 (Pre-Execution Validator) | SECOND location of deprecated Goal Alignment |
| SLAL | Phase 3 (Signal Orchestrator) | Instruments GENERATION/SIZING stages |
| ModeRegistry | All engines | Central registry for engine instances |
| Price Cache | Phase 4 (Kraken Service) | Rate-governed price fetching |
| Execution Config | Phase 4 (RISK-031) | MAX_POSITION_RISK contradiction |
| RTB Promotion | Phase 3 (RTB Service) | Consumes ranked signals from RTB queue |

---

## 21. Critical Findings

### Bugs Found

| ID | Severity | Finding | Kyle Decision |
|----|----------|---------|---------------|
| BUG-010 | **CRITICAL** → INFORMATIONAL | TradingEngine uses `Math.random()` for partial fills in live mode (lines 347-388). Placeholder code. | **Deferred** — live mode not in scope. Informational until live refactor. |
| BUG-011 | **CRITICAL** → INFORMATIONAL | TradingEngine uses `Math.random()` for slippage/fees in live mode (lines 391-393). | **Deferred** — live mode not in scope. Informational until live refactor. |
| BUG-012 | **HIGH** | TradingEngine still computes and applies Goal Alignment (lines 246-254). Second location of deprecated logic. | **Confirmed** — remove with Goal Alignment. Wave 4.5. |

### Risks Found

| ID | Severity | Finding | Kyle Decision |
|----|----------|---------|---------------|
| RISK-032 | **MEDIUM** → ACCEPTED | MicroExecutionService `triggerSymbolCheck()` is a TODO stub. | **Accepted** — experimental/dormant. Leave hidden. |
| RISK-033 | **LOW** | `trade-flow.ts` StrategyType only lists 9 strategies vs. 17 canonical. | Concurrent with BUG-002/003 fix. |
| RISK-034 | **LOW** | Failed RTB promotion does not restore signal to queue. | No immediate action. |
| RISK-035 | **LOW** | `max_holding_period` exit maps to close reason 'UNKNOWN'. | No immediate action. |
| RISK-036 | **MEDIUM** → INFORMATIONAL | TradingEngine exit slippage uses `Math.random()` in live mode. | **Deferred** — bundled with BUG-010/011. |

### NLAI Deprecation (Phase 5 Addendum — Kyle, 2026-02-16)

| Component | Status | Removal Scope |
|-----------|--------|---------------|
| NLAI Interpreter | 🔴 LEGACY | `nlai-interpreter.ts` — remove |
| Contextual NLAI Interpreter | 🔴 LEGACY | `contextual-nlai-interpreter.ts` — remove |
| NLAI Execution Broker | 🔴 LEGACY | `nlai-execution-broker.ts` — remove |
| NLAI Action Registry | 🔴 LEGACY | `nlai-action-registry.ts` — remove |
| Execution Policy Controller | 🔴 LEGACY | `execution-policy-controller.ts` — remove (NLAI-only consumer) |
| NLAI cluster bus events | 🔴 LEGACY | Remove event handlers |
| NLAI API routes | 🔴 LEGACY | Remove route handlers |
| Goal-update command handlers | 🔴 LEGACY | Remove (Goals tab already removed) |

---

## 22. Forward Audit Standard Checks

Per Phase 4 Section 23, any subsystem operating independently of canonical routing is flagged.

| Subsystem | Verdict | Reasoning |
|-----------|---------|-----------|
| ExecutionPolicyController | 🔴 **LEGACY — Remove with NLAI** (Kyle, 2026-02-16) | Used solely as NLAI approval gate. Walter deprecated. Remove with NLAI system. |
| NLAIExecutionBroker | 🔴 **LEGACY — Remove with NLAI** (Kyle, 2026-02-16) | Part of deprecated NLAI conversational control infrastructure. |
| NLAI Interpreter + Registry | 🔴 **LEGACY — Remove** (Kyle, 2026-02-16) | `nlai-interpreter.ts`, `contextual-nlai-interpreter.ts`, `nlai-action-registry.ts` — all part of deprecated Walter command bridge. |
| TradingEngine (Goal Alignment) | **⚠ DEPRECATED CODE — Deferred** | Goal Alignment formally deprecated per Kyle. TradingEngine itself deferred until paper mode stable. Goal Alignment removal still required (Wave 4.5). |
| TradingEngine (Placeholder Code) | **⚠ INFORMATIONAL ONLY** | BUG-010/011/RISK-036 are live-mode deficiencies. Non-blocking; live mode is deferred. |
| MicroExecutionService | 🟡 **Experimental/Dormant — Accepted** (Kyle, 2026-02-16) | Paper-only, non-interfering. Leave hidden. Revisit if micro-price trading becomes intentional. |

### Forward Standard for Remaining Phases

Kyle's directive for ongoing audits: if any subsystem operates in parallel to the canonical pipeline, supervises without affecting execution, maintains independent classification logic, exists without being referenced in Signal Orchestrator/DSE/TradeSafety, or appears to be legacy conversational/autonomy scaffolding — it must be flagged as:

> **POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION**

---

## 23. File Catalog

### Active Execution Files

| File | Lines | Directive | Status |
|------|-------|-----------|--------|
| `paper-execution-engine.ts` | ~2,308 | 11.0E | ✅ Primary engine (AUTHORITATIVE) |
| `trading-engine.ts` | ~766 | Phase 37 | ⏸️ Deferred — live mode not in scope. Contains deprecated Goal Alignment. |
| `trailing-exit-controller.ts` | ~335 | 9.2.A / 11.3A | ✅ Active trailing exit |
| `micro-execution-service.ts` | ~374 | 27.F.14.MICRO | 🟡 Experimental/dormant — accepted by Kyle |
| `mode-registry.ts` | ~162 | 27.F.15.B.4 | ✅ Engine registry + telemetry |
| `lifecycle-events.ts` | ~177 | REB 2.12D | ✅ Event broadcasting |
| `execution-timing.ts` | ~274 | — | ✅ Order timing instrumentation |
| `bob-trade.ts` | ~252 | 27.F.15.A | ✅ Trade data cache |
| `price-cache.ts` | ~448 | 8.8.4-A4.R10R-4 | 🔒 LOCKED |
| `paper-sim-service.ts` | ~300+ | — | ✅ Session management |

### LEGACY Execution Files (Phase 5 Addendum — Kyle Deprecated NLAI)

| File | Lines | Status |
|------|-------|--------|
| `execution-policy-controller.ts` | ~309 | 🔴 LEGACY — remove with NLAI |
| `nlai-execution-broker.ts` | ~477 | 🔴 LEGACY — remove with NLAI |
| `nlai-interpreter.ts` | TBD | 🔴 LEGACY — remove |
| `contextual-nlai-interpreter.ts` | TBD | 🔴 LEGACY — remove |
| `nlai-action-registry.ts` | TBD | 🔴 LEGACY — remove |

### Supporting Type/Config Files

| File | Lines | Status |
|------|-------|--------|
| `trade-flow.ts` | ~127 | ⚠ 9 strategies vs 17 canonical |
| `execution-config.ts` | ~23 | ✅ TEC config (RISK-031 noted) |
| `signal_lifecycle_audit.ts` | ~300+ | ✅ SLAL instrumentation |
| `covariance-engine.ts` | ~371 | ✅ Portfolio risk math |

---

## 24. Kyle's Architectural Confirmations (Phase 5 Addendum)

### Authoritative Execution Scope

The only execution path currently in scope for architectural validation is:

```
FX5 → SQE → RTB → TCL → PaperExecutionEngine → DSE → TradeSafety → Exit Loop
```

Anything outside this path is non-blocking unless it:
- Interferes with paper execution
- Mutates shared execution state
- Overrides guardrails
- Alters sizing logic
- Injects signals

### Confirmed: No Hidden Shutdown Logic

Kill switch in guardrails remains the sole automatic shutdown mechanism. No hidden halts exist in the execution layer.

### Confirmed: DSE Cap Authority Deferred

The DSE cap vs guardrail authority conflict (RISK-031) remains on the post-audit design reconciliation list. No change during audit phase.

### Confirmed: Autonomy Cluster Reminder

MCP, GASP, MOF, MACO, ECS, etc. remain legacy autonomy infrastructure — slated for removal. Not part of execution path.

### Summary of Kyle Decisions

| Topic | Decision |
|-------|----------|
| Paper mode | **Authoritative** — sole execution path in scope |
| Live mode | **Deferred** — refactor after paper mode stable |
| NLAI | **Deprecated** — remove all files |
| Goal Alignment | **Remove completely** — all locations, all references |
| MicroExecution | **Accepted** — experimental/dormant, leave hidden |
| DSE cap conflict | **Deferred** — post-audit reconciliation |
| TradingEngine | **Deferred** — future fork: refactor or rebuild from paper core |

---

## 25. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| v1.0 | 2026-02-16 | Initial Phase 5 audit — dual engine architecture, exit management, lifecycle, 3 bugs + 5 risks found | Claude Code |
| v1.1 | 2026-02-16 | Phase 5 Addendum: NLAI formally deprecated (Kyle), TradingEngine deferred, MicroExecution accepted as experimental, BUG-010/011/RISK-036 reclassified as informational, RISK-032 accepted, NLAI deprecation table added, Forward Audit Standard expanded | Claude Code |
