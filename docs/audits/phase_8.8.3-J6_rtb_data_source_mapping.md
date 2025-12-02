# Phase 8.8.3-J6: RTB Metrics Full Data Source Mapping

## Overview
This document provides a complete diagnostic mapping of all RTB (Ready-to-Buy) execution metrics data sources. This is a read-only inspection with no behavioral changes made.

**Audit Date:** 2025-12-02
**Test Credentials:** username=testuser123, password=SecurePass123!
**Mode:** paper (with x-app-mode header)

---

## J6.1 — RTB Summary Metrics Mapping

| Metric | Query/Function Source | File:Line | DB Table | Columns Used | Time Window Logic | Filters | Notes |
|--------|----------------------|-----------|----------|--------------|-------------------|---------|-------|
| Total Attempts (All Time) | `getExecutionAttemptMetrics()` | server/storage.ts:3478-3519 | `execution_attempt_audit` | All rows | None (all time) | `mode = 'paper'\|'live'` | Counts all rows matching mode |
| Total Attempts (Last 24h) | `getExecutionAttemptMetrics()` | server/storage.ts:3504-3508 | `execution_attempt_audit` | `createdAt` | `new Date() - 24h` | `mode + createdAt >= last24h` | In-memory filter on all audits |
| Total Opened (All Time) | `getExecutionAttemptMetrics()` | server/storage.ts:3491 | `execution_attempt_audit` | `decision` | None | `decision = 'OPENED'` | Count of OPENED decisions |
| Total Opened (Last 24h) | `getExecutionAttemptMetrics()` | server/storage.ts:3509 | `execution_attempt_audit` | `decision`, `createdAt` | `last24h` filter | Mode + Time + `decision = 'OPENED'` | Subset of last24h audits |
| Total Blocked (All Time) | `getExecutionAttemptMetrics()` | server/storage.ts:3492 | `execution_attempt_audit` | `decision` | None | `decision = 'BLOCKED'` | Count of BLOCKED decisions |
| Total Blocked (Last 24h) | `getExecutionAttemptMetrics()` | server/storage.ts:3510 | `execution_attempt_audit` | `decision`, `createdAt` | `last24h` filter | Mode + Time + `decision = 'BLOCKED'` | Subset of last24h audits |
| Open Rate % | Computed in endpoint | server/routes.ts:10738 | N/A (computed) | N/A | N/A | N/A | `(opened / totalAttempts) * 100` |
| Block Rate % | Computed in endpoint | server/routes.ts:10739 | N/A (computed) | N/A | N/A | N/A | `(blocked / totalAttempts) * 100` |

### SQL/Drizzle Operation Details
```typescript
// server/storage.ts:3487-3489
const allAudits = await db.select()
  .from(executionAttemptAudit)
  .where(eq(executionAttemptAudit.mode, mode));
```

### Discrepancy Found
- **Rate calculation uses ALL TIME totals, not Last 24h**: The `openedRate` and `blockedRate` are computed using `totalAttempts` (all time), not `last24hAttempts`. This means UI shows "Last 24h" column but the Rate column reflects all-time percentages.

---

## J6.2 — Blocked Breakdown Mapping

### All Block Reasons in Database Schema

| Block Reason (Enum Value) | In DB | In UI | Count (Paper Mode) | Notes |
|---------------------------|-------|-------|-------------------|-------|
| `KILL_SWITCH` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `NO_STOP_LOSS` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `INVALID_STOP_LOSS` | Yes (enum) | Yes | 9 | Active block reason |
| `POSITION_LIMIT` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `COOLDOWN` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `MAX_POSITION` | Yes (enum) | Yes | 7,737 | **Primary block reason** |
| `LPCP_LOW_PRICE` | Yes (enum) | No occurrences | 0 | Low Price Coin Protection |
| `LPCP_MIN_NOTIONAL` | Yes (enum) | No occurrences | 0 | Minimum notional guard |
| `FX_CONVERSION_FAILED` | Yes (enum) | Yes | 2 | Currency conversion error |
| `PORTFOLIO_RISK` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `INSUFFICIENT_BALANCE` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `MAX_EXPOSURE` | Yes (enum) | No occurrences | 0 | Unused in current data |
| `MAX_TRADES` | Yes (enum) | No occurrences | 0 | Unused in current data |

### Source Query Details

| Block Reason | Source Query | Table | Aggregation Method | Count | Notes |
|--------------|--------------|-------|-------------------|-------|-------|
| Max Position | `getExecutionAttemptMetrics()` | `execution_attempt_audit` | In-memory groupBy on `blockReason` | 7,737 | Dominant block reason |
| Invalid Stop Loss | `getExecutionAttemptMetrics()` | `execution_attempt_audit` | In-memory groupBy on `blockReason` | 9 | Stop loss validation failure |
| FX Conversion Failed | `getExecutionAttemptMetrics()` | `execution_attempt_audit` | In-memory groupBy on `blockReason` | 2 | Currency conversion error |

### Aggregation Logic (server/storage.ts:3495-3502)
```typescript
const blockedByReason: Record<string, number> = {};
allAudits
  .filter(a => a.decision === 'BLOCKED' && a.blockReason)
  .forEach(a => {
    const reason = a.blockReason as string;
    blockedByReason[reason] = (blockedByReason[reason] || 0) + 1;
  });
```

### Missing from UI
The following block reasons are defined in the schema but have no recorded occurrences:
- KILL_SWITCH
- NO_STOP_LOSS
- POSITION_LIMIT
- COOLDOWN
- LPCP_LOW_PRICE
- LPCP_MIN_NOTIONAL
- PORTFOLIO_RISK
- INSUFFICIENT_BALANCE
- MAX_EXPOSURE
- MAX_TRADES

---

## J6.3 — Strategy Breakdown (Blocked)

| Strategy | Source Query | Table | Aggregation Method | Count | Notes |
|----------|--------------|-------|-------------------|-------|-------|
| sma_trend_ride | `getExecutionAttemptAudits()` | `execution_attempt_audit` | In-memory groupBy (routes.ts:10762-10767) | 272 | |
| vwap_bounce | `getExecutionAttemptAudits()` | `execution_attempt_audit` | In-memory groupBy | 184 | |
| mean_reversion | `getExecutionAttemptAudits()` | `execution_attempt_audit` | In-memory groupBy | 32 | |
| vwap_pullback | `getExecutionAttemptAudits()` | `execution_attempt_audit` | In-memory groupBy | 10 | |
| dhma | `getExecutionAttemptAudits()` | `execution_attempt_audit` | In-memory groupBy | 2 | |
| abcd_long | Schema only | `execution_attempt_audit` | N/A | 0 | No blocked attempts |
| breakout | Schema only | `execution_attempt_audit` | N/A | 0 | No blocked attempts |
| range_trading | Schema only | `execution_attempt_audit` | N/A | 0 | No blocked attempts |
| liquidity_trap | Schema only | `execution_attempt_audit` | N/A | 0 | No blocked attempts |

### Strategy Enum (shared/schema.ts:27-37)
```typescript
export const strategyTypeEnum = pgEnum("strategy_type", [
  "vwap_pullback", 
  "abcd_long", 
  "sma_trend_ride",
  "breakout",
  "mean_reversion",
  "range_trading",
  "vwap_bounce",
  "liquidity_trap",
  "dhma"
]);
```

### Discrepancy Found
- **Strategy sum does not equal total blocked**: Sum from API = 500 (limited by query), Total blocked = 7,748
- **Limit of 500 in query**: `getExecutionAttemptAudits(mode, { decision: 'BLOCKED', limit: 500 })` at routes.ts:10760
- This causes incomplete strategy breakdown since only last 500 blocked attempts are counted

---

## J6.4 — Opened Breakdown Mapping

| Strategy | Source Query | DB Table | Count | Notes |
|----------|--------------|----------|-------|-------|
| vwap_pullback | `getExecutionAttemptAudits(mode, { decision: 'OPENED' })` | `execution_attempt_audit` | 0 | No opened trades |
| abcd_long | Same | `execution_attempt_audit` | 0 | No opened trades |
| sma_trend_ride | Same | `execution_attempt_audit` | 0 | No opened trades |
| breakout | Same | `execution_attempt_audit` | 0 | No opened trades |
| mean_reversion | Same | `execution_attempt_audit` | 0 | No opened trades |
| range_trading | Same | `execution_attempt_audit` | 0 | No opened trades |
| vwap_bounce | Same | `execution_attempt_audit` | 0 | No opened trades |
| liquidity_trap | Same | `execution_attempt_audit` | 0 | No opened trades |
| dhma | Same | `execution_attempt_audit` | 0 | No opened trades |

### Source Query (server/routes.ts:10795)
```typescript
const openedAudits = await storage.getExecutionAttemptAudits(mode, { decision: 'OPENED', limit: 500 });
```

### Current API Response (Paper Mode)
```json
{
  "totalOpened": 0,
  "openedLast24h": 0,
  "byStrategy": {},
  "bySymbol": [],
  "topStrategies": []
}
```

---

## J6.5 — Qty and $ Value Mapping for RTB Table

| UI Column | Source Query | DB Table | Calculation Formula | Guardrails Used | Notes |
|-----------|--------------|----------|---------------------|-----------------|-------|
| Qty (estimatedQuantity) | Computed in `/api/trading-signals` | `portfolio_state` (portfolioValue), `guardrails_v2` (riskPerTradePct), `trading_signals` (entryPrice, stopPrice) | `riskAmount / stopDistance` where `riskAmount = portfolioValue * riskPerTradePct / 100` and `stopDistance = abs(entryPrice - stopPrice)` | `portfolioRiskPerTradePct` from guardrails_v2 | Position sizing based on risk |
| Notional Value ($) (estimatedValue) | Computed in `/api/trading-signals` | Same as Qty | `quantity * entryPrice` | Same as Qty | Total position value |

### Calculation Logic (server/routes.ts:3628-3669)
```typescript
// 1. Get portfolio value (default: $50,000)
let portfolioValue = 50000;
const portfolioState = await storage.getPortfolioState({ mode });
if (portfolioState?.totalValue) {
  const parsedValue = parseFloat(String(portfolioState.totalValue));
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    portfolioValue = parsedValue;
  }
}

// 2. Get risk per trade from guardrails (default: 1.50%)
const guardrails = await storage.getGuardrailsV2({ mode });
const riskPerTradePct = parseFloat(String(guardrails?.portfolioRiskPerTradePct || '1.50'));
const safeRiskPct = Number.isFinite(riskPerTradePct) && riskPerTradePct > 0 ? riskPerTradePct : 1.50;
const riskAmount = (portfolioValue * safeRiskPct) / 100;

// 3. Compute quantity for each signal
const stopDistance = Math.abs(entryPrice - stopPrice);
let quantity = 0;
let estimatedValue = 0;

if (stopDistance > 0 && Number.isFinite(riskAmount) && Number.isFinite(entryPrice)) {
  quantity = riskAmount / stopDistance;
  if (Number.isFinite(quantity)) {
    estimatedValue = quantity * entryPrice;
  }
}
```

### Fallback/Guard Logic
| Condition | Fallback | File:Line |
|-----------|----------|-----------|
| `portfolioValue` is NaN or <= 0 | Use $50,000 default | routes.ts:3629-3636 |
| `riskPerTradePct` is NaN or <= 0 | Use 1.50% default | routes.ts:3641 |
| `stopDistance` is 0 | Set quantity = 0, estimatedValue = 0 | routes.ts:3652 |
| `quantity` is NaN or Infinity | Set quantity = 0 | routes.ts:3656-3661 |
| `estimatedValue` is NaN or Infinity | Set estimatedValue = 0 | routes.ts:3657-3659 |

---

## Database Schema Reference

### execution_attempt_audit Table (shared/schema.ts:1738-1762)
```typescript
export const executionAttemptAudit = pgTable("execution_attempt_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  mode: tradingModeEnum("mode").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  signalId: varchar("signal_id"),
  decision: executionDecisionEnum("decision").notNull(),
  blockReason: executionBlockReasonEnum("block_reason"),
  blockDetail: text("block_detail"),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  portfolioValue: decimal("portfolio_value", { precision: 20, scale: 2 }),
  riskAmount: decimal("risk_amount", { precision: 20, scale: 2 }),
  positionSize: decimal("position_size", { precision: 20, scale: 8 }),
  tradeId: varchar("trade_id"),
});
```

### Indexes
- `execution_attempt_audit_created_at_idx` on `createdAt`
- `execution_attempt_audit_mode_idx` on `mode`
- `execution_attempt_audit_symbol_idx` on `symbol`
- `execution_attempt_audit_strategy_idx` on `strategy`
- `execution_attempt_audit_decision_idx` on `decision`

---

## Documented Discrepancies (DO NOT FIX in J6)

1. **Rate calculation uses all-time totals**: Open/Block Rate % uses `totalAttempts` instead of `last24hAttempts`, making the rate column inconsistent with the "Last 24h" context.

2. **Strategy breakdown query limited to 500**: The blocked summary endpoint uses `limit: 500` in `getExecutionAttemptAudits()`, causing incomplete strategy counts. Current sum (500) << total blocked (7,748).

3. **In-memory filtering for time windows**: All 24h filtering happens in JavaScript after fetching all records, which could cause performance issues with large datasets.

4. **No database-level aggregation**: The `getExecutionAttemptMetrics()` function fetches ALL audit records into memory and does counting in JavaScript rather than using SQL COUNT/GROUP BY.

5. **Unused block reasons**: 10 of 13 block reason enum values have no recorded occurrences (KILL_SWITCH, NO_STOP_LOSS, POSITION_LIMIT, COOLDOWN, LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, PORTFOLIO_RISK, INSUFFICIENT_BALANCE, MAX_EXPOSURE, MAX_TRADES).

6. **Missing strategies in data**: 4 of 9 strategy enum values have no blocked attempts recorded (abcd_long, breakout, range_trading, liquidity_trap).

---

## UI Formatting Changes (J6.2)

### Completed Changes
1. **Added comma separators**: All large numbers in RTB metrics tables now use `Intl.NumberFormat('en-US').format()` for comma-separated display.

2. **Removed "Total" column from RTB Summary**: Only "Last 24h" column is displayed as the default/statistically meaningful period.

3. **Improved Qty column formatting**: 
   - Comma separators for quantity values
   - Dollar sign + comma separators for notional values
   - Right-aligned numeric columns
   - Font-mono for numeric consistency

4. **"Recent Attempts" list removal confirmed**: List was removed in J5, no leftover empty containers remain.

5. **Added Rate column clarification**: Added "Rate*" with tooltip and footnote explaining "*Rate uses all-time totals" to clarify the calculation period mismatch (documented discrepancy, no behavior change).

### Files Modified
- `client/src/components/trading/execution-metrics.tsx`
- `client/src/components/trading/ready-to-buy-table.tsx`

---

## API Test Results (2025-12-02)

### RTB Summary (paper mode)
```json
{
  "totalAttempts": 7748,
  "opened": 0,
  "blocked": 7748,
  "openedRate": "0.0",
  "blockedRate": "100.0",
  "last24h": {
    "attempts": 7748,
    "opened": 0,
    "blocked": 7748
  }
}
```

### RTB Blocked Summary (paper mode)
```json
{
  "totalBlocked": 7748,
  "blockedLast24h": 7748,
  "byReason": {
    "MAX_POSITION": 7737,
    "FX_CONVERSION_FAILED": 2,
    "INVALID_STOP_LOSS": 9
  },
  "byStrategy": {
    "vwap_bounce": 184,
    "sma_trend_ride": 272,
    "mean_reversion": 32,
    "vwap_pullback": 10,
    "dhma": 2
  }
}
```

### RTB Opened Summary (paper mode)
```json
{
  "totalOpened": 0,
  "openedLast24h": 0,
  "byStrategy": {},
  "bySymbol": [],
  "topStrategies": []
}
```

---

## Next Steps (J7 Correction Phase)

Issues documented above should be addressed in Phase 8.8.3-J7:
1. Fix rate calculation to use Last 24h counts
2. Remove limit or use proper SQL aggregation for strategy breakdown
3. Add proper database-level aggregation (SQL COUNT/GROUP BY)
4. Address performance concerns for large datasets
