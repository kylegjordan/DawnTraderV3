# AJ19 Metrics Wiring & Trade Closure Analysis

**Date:** December 3, 2025  
**Phase:** 8.8.3-AJ19  
**Purpose:** Clarify "Attempts" metric definition and trade closure process

---

## 1. What Does "Attempts" Count?

### Answer: (a) Ready-to-buy candidates that reached the guardrail layer

**The "Attempts" metric counts signals that have already passed all filters and strategies and are now being evaluated for execution by the guardrail layer (P3 validation).**

### Code Evidence

The `Attempts` count is tracked in the `execution_attempt_audits` table. An entry is created only when `logExecutionAttempt()` is called:

```typescript
// File: server/services/paper-execution-engine.ts

// Location 1: Line 1303 - Called when guardrails BLOCK a trade
this.logExecutionAttempt({
  mode: this.mode,
  symbol: signal.symbol,
  strategy: signal.strategy,
  decision: 'BLOCKED',
  blockReason: riskCheck.code,
  blockDetail: riskCheck.reason,
  ...
});

// Location 2: Line 1531 - Called when trade is OPENED
this.logExecutionAttempt({
  mode: this.mode,
  symbol: signal.symbol,
  strategy: signal.strategy,
  decision: 'OPENED',
  tradeId: trade.id,
  ...
});
```

### Pipeline Stage Where Attempts Are Logged

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRADING PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  P1: Market Scanning (Active Filter Pool)                                   │
│       └─> Filters pairs: Volume, Spread, Volatility, ATR, etc.             │
│                                                                             │
│  P2: Strategy Evaluation                                                    │
│       └─> Generates RTB signals with entry/stop/target                      │
│       └─> Position sizing calculated here (pre-sized quantity)              │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  │                                                                         │
│  │  P3: Guardrail Layer (checkGuardrailRisk)   <── ATTEMPTS LOGGED HERE   │
│  │       └─> Kill Switch check                                             │
│  │       └─> Stop Loss check                                               │
│  │       └─> Asset cooldown check                                          │
│  │       └─> MAX_POSITION check (position size % of portfolio)             │
│  │       └─> MAX_TRADES check (total open trades count)                    │
│  │       └─> POSITION_LIMIT check (already have position in symbol)        │
│  │                                                                         │
│  │       Result: BLOCKED → logExecutionAttempt(decision: 'BLOCKED')        │
│  │       Result: PASS   → Trade created → logExecutionAttempt('OPENED')    │
│  │                                                                         │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What is NOT Counted as an Attempt

- Pairs evaluated by filters that don't pass (P1 stage)
- Strategy evaluations that don't generate an RTB signal (P2 stage)
- Active pool × strategy combinations that are discarded before reaching guardrails

### Metrics Storage

```typescript
// File: server/storage.ts (lines 592-600)
getExecutionAttemptMetrics(mode: 'live' | 'paper'): Promise<{
  totalAttempts: number;    // Count of all execution_attempt_audits records
  opened: number;           // Records with decision = 'OPENED'
  blocked: number;          // Records with decision = 'BLOCKED'
  blockedByReason: Record<string, number>;  // Grouped by blockReason
  last24hAttempts: number;
  last24hOpened: number;
  last24hBlocked: number;
}>;
```

---

## 2. Trade Closure Process

### How a Trade Closes

Trades close when one of four exit conditions is met:

| Exit Condition | Trigger | Code Location |
|----------------|---------|---------------|
| `target_hit` | Current price >= Take Profit price | Lines 212-218 |
| `stop_hit` | Current price <= Stop Loss price | Lines 221-228 |
| `trailing_stop_hit` | Price drops below trailing stop level | Lines 230-254 |
| `max_holding_period` | Trade held longer than max hours (if configured) | Lines 257-271 |

### The Monitoring Loop

```typescript
// File: server/services/paper-execution-engine.ts

// Every 10 seconds while engine is running:
private async runMonitoringCycle(): Promise<void> {
  // Step 1: Check existing positions for exit conditions
  await this.checkOpenPositions();
  
  // Step 2: Scan for new trading opportunities
  await this.scanForSignals();
}
```

### Exit Condition Checking Flow

```typescript
// File: server/services/paper-execution-engine.ts (lines 205-274)

private async checkExitConditions(
  position: any,
  currentPrice: number,
  avgPrice: number,
  stopLoss: number | null,
  takeProfit: number | null
): Promise<ExitCondition | null> {
  
  // 1. Check target hit (Take Profit)
  if (takeProfit && currentPrice >= takeProfit) {
    return { type: 'target_hit', ... };
  }

  // 2. Check stop hit (Stop Loss)
  if (stopLoss && currentPrice <= stopLoss) {
    return { type: 'stop_hit', ... };
  }

  // 3. Check trailing stop (if configured in metadata)
  if (metadata?.trailingStopPercent && metadata?.highWaterMark) {
    const trailingStopPrice = highWaterMark * (1 - trailingStopPercent);
    if (currentPrice <= trailingStopPrice) {
      return { type: 'trailing_stop_hit', ... };
    }
  }

  // 4. Check max holding period (if configured in metadata)
  if (metadata?.maxHoldingPeriod) {
    const hoursHeld = (Date.now() - openTime) / (1000 * 60 * 60);
    if (hoursHeld >= maxHours) {
      return { type: 'max_holding_period', ... };
    }
  }

  return null; // No exit condition met - position stays open
}
```

---

## 3. Why Some Trades Stay Open Indefinitely

### Root Causes

| Reason | Explanation |
|--------|-------------|
| **Price Never Hits SL/TP** | The most common reason. If price hovers between stop loss and take profit, no exit triggers. |
| **No Max Holding Period** | Default trades do NOT have a max holding period configured in metadata. They will stay open forever unless SL/TP is hit. |
| **No Trailing Stop** | Default trades don't have trailing stops. Price can run up and then back down without triggering exit. |
| **Engine Not Running** | Exit conditions are only checked when the engine is running. If engine stops, positions remain in their current state. |
| **Ticker Fetch Errors** | If `getTicker()` fails for a symbol, that position is skipped for that cycle (line 166-169). |

### Example Scenario: Why a Trade Stays Open

```
Trade opened: BTC/USD @ $43,000
  - Stop Loss: $42,000
  - Take Profit: $45,000
  - No trailing stop configured
  - No max holding period configured

Price movement over 5 days:
  Day 1: $43,500 (not at TP, not at SL → stays open)
  Day 2: $44,800 (close to TP but not hit → stays open)
  Day 3: $42,500 (close to SL but not hit → stays open)
  Day 4: $43,200 (nowhere near SL or TP → stays open)
  Day 5: $43,000 (back to entry → stays open forever)

Result: Trade never closes because price never reaches $42,000 or $45,000
```

### How to Force Trades to Close

1. **Add Max Holding Period** - Configure `maxHoldingPeriod` in trade metadata
2. **Manual Force-Clear** - Use `/api/diagnostics/aj19b/force-clear-positions` endpoint
3. **Database Cleanup** - Directly delete from `paper_sim_open_positions` table
4. **Trailing Stops** - Configure `trailingStopPercent` and `highWaterMark` in metadata

---

## 4. Summary

| Question | Answer |
|----------|--------|
| What is "Attempts" counting? | Signals that reached the guardrail layer (P3) - either BLOCKED or OPENED |
| Does it count all filter evaluations? | No, only signals that passed P1 filters and P2 strategy generation |
| Why do trades stay open? | Price never hits SL or TP, and no max holding period is configured |
| How often are exits checked? | Every 10 seconds while engine is running |
| Can trades stay open forever? | Yes, if price never hits SL/TP and no time-based exit is configured |

---

## Files Referenced

- `server/services/paper-execution-engine.ts` - Trade execution and monitoring logic
- `server/storage.ts` - Database operations and metrics queries
- `server/routes.ts` - API endpoints for execution metrics (lines 11338-11503)
- `shared/schema.ts` - `ExecutionAttemptAudit` table definition
