# Phase 8.8.3-I1: Trading Pipeline Diagnostics

## Overview

This document describes the full trading pipeline for DawnTrader V3, documenting each stage from FX5 scanning through trade closure. This is a diagnostics-only phase with no behavior changes.

## Pipeline Stages

### 1. FX5 Scanner / Filtered Pool

**Purpose:** Scans the Kraken universe and filters pairs based on liquidity, spread, and volatility criteria.

| Component | File | Function(s) |
|-----------|------|-------------|
| FX5 Scanner Core | `server/services/fx5-scanner.ts` | `runScan()`, `evaluatePair()` |
| Active Filter Pool | `server/services/active-filter-pool.ts` | `addToPool()`, `getActivePool()`, `clearPool()` |
| Filtered Pairs Service | `server/services/filtered-pairs-service.ts` | `getFilteredPairs()` |
| Stage3 State Cache | `server/services/stage3-state-cache.ts` | `updateState()`, `getState()` |
| Stage3 Emitter | `server/services/stage3-emitter.ts` | `emitScanTick()`, `emitBreakdown()` |

**Input:** Kraken trading pairs universe (~1393 pairs)
**Output:** Active Filtered Pool (eligible pairs for strategy evaluation)

### 2. Ready-To-Buy (RTB) Queue / Signal Generation

**Purpose:** Evaluates filtered pairs against all enabled strategies to generate trading signals.

| Component | File | Function(s) |
|-----------|------|-------------|
| Signal Orchestrator | `server/services/signal-orchestrator.ts` | `start()`, `evaluateMarket()`, `buildSizedSignalForStrategy()` |
| Strategy Engine | `server/services/strategy-engine.ts` | `evaluateVWAPPullback()`, `evaluateMeanReversion()`, etc. |
| Paper Execution Engine | `server/services/paper-execution-engine.ts` | `scanForSignals()`, `checkSymbolForSignal()` |

**Input:** Active Filtered Pool from FX5
**Output:** Sized strategy signals (with preComputedNotional)

### 3. Sizing + Guardrails

**Purpose:** Calculates position size and validates against risk guardrails before trade execution.

| Component | File | Function(s) |
|-----------|------|-------------|
| Paper Position Sizing | `server/services/paper-position-sizing.ts` | `sizePaperPositionForSignal()`, `validatePaperPortfolioValue()` |
| Trade Safety | `server/services/trade-safety.ts` | `checkGuardrailRisk()` |
| Guardrail Settings | `server/services/guardrail-settings.ts` | `buildSettingsFromGuardrails()`, `getPortfolioBalanceV2()` |
| Guardrail Policy | `server/services/guardrail-policy.ts` | `getGuardrailPolicy()` |

**Guardrail Checks (in order):**
1. `checkKillSwitch()` - Kill switch tripped?
2. `checkStopLossRequired()` - Valid stop-loss present?
3. `checkMaxPositionsPerAsset()` - Already have position in symbol?
4. `checkSymbolCooldown()` - In cooldown period?
5. `checkPositionSizeCap()` - Position size within portfolio limit?
6. `checkLowPricedCoinProtection()` - LPCP (currently dormant per AJ8)
7. `checkMaxOpenTrades()` - At max open trades limit?

**Input:** Sized strategy signal
**Output:** TradeSafetyResult (ok: true/false with block code)

### 4. Trade Creation (Open Trades)

**Purpose:** Creates positions in database and in-memory state after passing guardrails.

| Component | File | Function(s) |
|-----------|------|-------------|
| Paper Execution Engine | `server/services/paper-execution-engine.ts` | `processSignal()`, `openPosition()` |
| Storage | `server/storage.ts` | `insertPaperSimOpenPosition()` |
| Kraken WebSocket Adapter | `server/services/kraken-websocket-adapter.ts` | `subscribeToSymbols()` |

**Input:** Approved signal (passed guardrails)
**Output:** 
- DB row in `paper_sim_open_positions`
- WebSocket subscription for real-time prices

### 5. Trade Closure

**Purpose:** Closes positions when exit conditions are met.

| Component | File | Function(s) |
|-----------|------|-------------|
| Paper Execution Engine | `server/services/paper-execution-engine.ts` | `monitoringCycle()`, `closePosition()`, `forceClosePosition()` |
| Paper Portfolio Manager | `server/services/paper-portfolio-manager.ts` | `forceCloseAllOpenPositionsOnStop()` |
| Storage | `server/storage.ts` | `closePaperSimPosition()`, `insertPaperSimTrade()` |

**Exit Conditions:**
- `target_hit` - Take profit price reached
- `stop_hit` - Stop loss price reached
- `trailing_stop_hit` - Trailing stop triggered
- `max_holding_period` - Max holding time exceeded
- `guardrail` - Guardrail triggered (e.g., kill switch)
- `manual_stop` - User or system initiated stop

**Input:** Open position with current price
**Output:** 
- DB row in `paper_sim_trades` (closed trade record)
- Position removed from `paper_sim_open_positions`

### 6. Session Lifecycle + Hard Stop

**Purpose:** Manages paper simulation session state and graceful shutdown.

| Component | File | Function(s) |
|-----------|------|-------------|
| Paper Sim Service | `server/services/paper-sim-service.ts` | `startPaperSimulation()`, `stopPaperSimulation()` |
| Paper Portfolio Manager | `server/services/paper-portfolio-manager.ts` | `start()`, `stop()`, `forceCloseAllOpenPositionsOnStop()` |
| Paper Session Reset | `server/services/paper-session-reset.ts` | `executeHardReset()` |
| Trading State Sync | `server/services/trading-state-sync.ts` | `setEngineActive()`, `setTradingMode()` |

**Hard Stop Sequence:**
1. `stopPaperSimulation()` called
2. `forceCloseAllOpenPositionsOnStop()` - closes all open positions
3. `manager.stop()` - stops execution engine and orchestrator
4. DB session updated to `status: 'stopped'`
5. WebSocket adapter stopped
6. State broadcasts sent

### 7. WebSocket + Price Engine

**Purpose:** Maintains real-time price feeds for open positions.

| Component | File | Function(s) |
|-----------|------|-------------|
| Kraken WebSocket Adapter | `server/services/kraken-websocket-adapter.ts` | `start()`, `stop()`, `subscribeToSymbols()`, `onPriceTick()` |
| Live Pricing Adapter | `server/services/live-pricing-adapter.ts` | `getPrice()`, `seedLastKnownGoodPrice()` |
| Kraken Pair Metadata | `server/services/kraken-pair-metadata.ts` | `normalToKrakenSymbol()`, `mapKrakenPairToInternalSymbol()` |

**Price Sources (in priority order):**
1. `kraken_ws` - Real-time Kraken WebSocket (preferred)
2. `binance` - Binance REST API
3. `coingecko` - CoinGecko REST API
4. `last_known_good` - Cached price from previous tick

---

## RTB Block Reasons (Current Code)

These are all the block reason codes that can prevent an RTB signal from becoming an open trade:

| Code | Function | Description |
|------|----------|-------------|
| `KILL_SWITCH` | `checkKillSwitch()` | Trading stopped due to Kill Switch activation |
| `NO_STOP_LOSS` | `checkStopLossRequired()` | Stop-loss is required for all trades |
| `INVALID_STOP_LOSS` | `checkStopLossRequired()` | Stop-loss must be below entry price for long positions |
| `POSITION_LIMIT` | `checkMaxPositionsPerAsset()` | Already have an open position in this symbol |
| `COOLDOWN` | `checkSymbolCooldown()` | Symbol is in cooldown period after recent trade |
| `MAX_POSITION` | `checkPositionSizeCap()` | Position size exceeds % of portfolio limit |
| `LPCP_LOW_PRICE` | `checkLowPricedCoinProtection()` | Low-priced coin protection (DORMANT per AJ8) |
| `LPCP_MIN_NOTIONAL` | `checkLowPricedCoinProtection()` | Trade notional below minimum (DORMANT per AJ8) |
| `FX_CONVERSION_FAILED` | `checkLowPricedCoinProtection()` | FX conversion failed for non-USD quote |
| `PORTFOLIO_RISK` | `checkGuardrailRisk()` | Portfolio-level risk exceeded |
| `INSUFFICIENT_BALANCE` | `checkGuardrailRisk()` | Not enough balance for trade |
| `MAX_EXPOSURE` | `checkGuardrailRisk()` | Single position exposure too high |
| `MAX_TOTAL_EXPOSURE` | `checkGuardrailRisk()` | Total portfolio exposure too high |
| `MAX_TRADES` | `checkMaxOpenTrades()` | At maximum number of open trades |

---

## Diagnostic Endpoints (Phase 8.8.3-I1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/diagnostics/rtb-blocks?raw=1` | GET | RTB block reason summary with per-symbol and per-reason breakdown |
| `/api/diagnostics/rtb-blocks/reset` | POST | Reset RTB block diagnostics buffer |
| `/api/diagnostics/trade-lifecycle?raw=1` | GET | Trade lifecycle events with hard stop summaries |
| `/api/diagnostics/trade-lifecycle/reset` | POST | Reset trade lifecycle diagnostics buffer |
| `/api/diagnostics/open-position-ws-linkage?mode=paper&raw=1` | GET | WebSocket subscription status for all open positions |
| `/api/diagnostics/ws-price-engine?raw=1` | GET | WebSocket price engine status (existing B3.6) |

### Response Examples

**RTB Blocks Response:**
```json
{
  "ok": true,
  "sessionStart": "2025-12-07T10:00:00.000Z",
  "totals": { "attempts": 150, "blocks": 45 },
  "byReason": { "COOLDOWN": 20, "POSITION_LIMIT": 15, "MAX_POSITION": 10 },
  "byStrategy": { "vwap_pullback": 25, "breakout": 20 },
  "recentBlocks": [...]
}
```

**Trade Lifecycle Response:**
```json
{
  "ok": true,
  "sessionStart": "2025-12-07T10:00:00.000Z",
  "totalSignals": 100,
  "totalOpened": 55,
  "totalClosed": 48,
  "totalForceClosed": 7,
  "byCloseReason": { "target_hit": 30, "stop_hit": 10, "manual_stop": 8 },
  "hardStopSummaries": [{ "sessionId": "...", "openPositionsBefore": 7, "positionsClosedByHardStop": 7 }],
  "recentEvents": [...]
}
```

**WS Linkage Response:**
```json
{
  "ok": true,
  "mode": "paper",
  "openPositionCount": 5,
  "wsSubscribedCount": 5,
  "linkedCount": 5,
  "orphanedCount": 0,
  "health": "healthy",
  "linkageDetails": [...]
}
```

---

## Log Prefixes (Phase 8.8.3-I1)

All new diagnostic logs use the `[8.8.3-I1]` prefix:

- `[8.8.3-I1][RTB_ATTEMPT]` - RTB signal evaluation started
- `[8.8.3-I1][RTB_BLOCK]` - RTB signal blocked by guardrail
- `[8.8.3-I1][RTB_OPEN]` - RTB signal passed, trade opened
- `[8.8.3-I1][TRADE_SIGNAL]` - Strategy signal accepted into RTB
- `[8.8.3-I1][TRADE_OPEN]` - Trade created from RTB
- `[8.8.3-I1][TRADE_UPDATE]` - Trade P&L updated
- `[8.8.3-I1][TRADE_CLOSE]` - Trade closed normally
- `[8.8.3-I1][TRADE_FORCE_CLOSE]` - Trade closed by hard stop
- `[8.8.3-I1][HARD_STOP_SUMMARY]` - Summary after hard stop completes
- `[8.8.3-I1][SLOT_STATE]` - Open trade slot evaluation snapshot

---

## Runtime Test Artifacts

After running the diagnostic phase, the following artifacts should be captured:

| Artifact | Description |
|----------|-------------|
| `ws_diagnostics_post_I1.json` | WebSocket price engine and linkage status |
| `rtb_block_summary_post_I1.json` | RTB block reason breakdown |
| `trade_lifecycle_log_post_I1.json` | Trade lifecycle events |
| `db_open_positions_post_I1.json` | DB snapshot of open positions |
| `db_recent_trades_post_I1.json` | DB snapshot of recent trades |
| `sim_status_post_I1.json` | Paper sim status |

---

## Version History

- **2025-12-07**: Initial creation (Phase 8.8.3-I1)
