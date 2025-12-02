# Phase 8.8.3-J5: RTB Aggregated Execution Metrics

## Overview
Phase J5 adds aggregated execution metrics for the Ready-to-Buy (RTB) trading signals pipeline. This phase introduces three new API endpoints that provide summarized views of RTB execution attempts, blocked signals breakdown, and opened positions breakdown - all read-only with 30-second auto-refresh.

## Implementation Date
2025-12-02

## Changes Made

### 1. Backend API Endpoints (server/routes.ts)

#### GET /api/metrics/rtb-summary
Returns overall RTB execution metrics:
- `totalAttempts`: Total execution attempts (all time)
- `opened`: Number of positions opened
- `blocked`: Number of attempts blocked by guardrails
- `openedRate`: Success rate percentage
- `blockedRate`: Block rate percentage
- `last24h`: Same metrics filtered to last 24 hours

#### GET /api/metrics/rtb-blocked-summary
Returns breakdown of blocked attempts:
- `totalBlocked`: Total blocked count
- `blockedLast24h`: Blocked in last 24 hours
- `byReason`: Breakdown by block reason (MAX_POSITION, INVALID_STOP_LOSS, etc.)
- `byStrategy`: Breakdown by strategy name
- `topReasons`: Top 5 block reasons sorted by count

#### GET /api/metrics/rtb-opened-summary
Returns breakdown of opened positions:
- `totalOpened`: Total opened count
- `openedLast24h`: Opened in last 24 hours
- `byStrategy`: Breakdown by strategy name
- `bySymbol`: Top symbols by position count
- `topStrategies`: Top 5 strategies by opened positions

### 2. Frontend Changes (execution-metrics.tsx)

- **Removed**: "Recent Attempts" list UI (was showing raw attempt logs)
- **Added**: Three new aggregated metric tables:
  - Overall RTB Summary (Metric / Total / Last 24h / Rate)
  - Blocked Breakdown (Reason / Count / Strategy / Count)
  - Opened Breakdown (Strategy / Count / Symbol / Count)
- **Added**: "Auto-refresh: 30s" badge indicator
- **Added**: 30-second auto-refresh interval for all tables

### 3. RTB Live Table Enhancement (ready-to-buy-table.tsx)

- **Added**: `estimatedQuantity` and `estimatedValue` fields to TradingSignal interface
- **Added**: 'quantity' to SortField type
- **Added**: Quantity column sorting logic
- **Added**: "Qty" column header with sorting
- **Added**: Quantity data cell with estimated value sub-text

### 4. Position Sizing in API (server/routes.ts)

Added dynamic quantity computation in `/api/trading-signals` endpoint:
```typescript
// Get portfolio value from portfolio_state
const portfolioState = await storage.getPortfolioState({ mode });

// Get risk per trade from guardrails_v2 (not deprecated getSettings)
const guardrails = await storage.getGuardrailsV2({ mode });
const riskPerTradePct = guardrails?.portfolioRiskPerTradePct || '1.50';

// Compute risk amount and quantity
const riskAmount = (portfolioValue * riskPerTradePct) / 100;
const quantity = riskAmount / stopDistance;
const estimatedValue = quantity * entryPrice;
```

### 5. Defensive Guards

Added comprehensive NaN/Infinity protection:
- Portfolio value validation (must be finite and > 0)
- Risk percentage validation (falls back to 1.50%)
- Stop distance validation (must be > 0)
- Quantity validation (must be finite)
- Estimated value validation (must be finite)

## API Test Results (2025-12-02)

### RTB Summary (paper mode)
```json
{
  "success": true,
  "data": {
    "totalAttempts": 6377,
    "opened": 0,
    "blocked": 6377,
    "openedRate": 0,
    "blockedRate": 100,
    "last24h": {
      "attempts": 6377,
      "opened": 0,
      "blocked": 6377
    }
  }
}
```

### RTB Blocked Summary (paper mode)
```json
{
  "success": true,
  "data": {
    "totalBlocked": 6377,
    "blockedLast24h": 6377,
    "byReason": {
      "MAX_POSITION": 6370,
      "FX_CONVERSION_FAILED": 2,
      "INVALID_STOP_LOSS": 5
    },
    "byStrategy": {
      "mean_reversion": 108,
      "vwap_bounce": 259,
      "sma_trend_ride": 101,
      "vwap_pullback": 28,
      "dhma": 3,
      "range_trading": 1
    }
  }
}
```

### RTB Opened Summary (paper mode)
```json
{
  "success": true,
  "data": {
    "totalOpened": 0,
    "openedLast24h": 0,
    "byStrategy": {},
    "bySymbol": [],
    "topStrategies": []
  }
}
```

## Constraints Verified

1. **Read-only additions only**: No schema mutations, no new tables
2. **No engine/guardrail behavior changes**: All metrics are derived from existing audit data
3. **Auth middleware preserved**: All new endpoints require authentication
4. **30-second refresh interval**: Frontend auto-refreshes metrics
5. **Method name fix**: Uses `getGuardrailsV2` instead of deprecated `getSettings`

## Files Modified

- `server/routes.ts`: Added 3 new API endpoints, fixed quantity computation
- `client/src/components/trading/execution-metrics.tsx`: Added aggregated tables, removed "Recent Attempts" list
- `client/src/components/trading/ready-to-buy-table.tsx`: Added Qty column with sorting

## Migration Note

The `storage.getSettings()` method was removed in Phase 41F-L.E2E-PURGE. J5 now uses `storage.getGuardrailsV2({ mode })` to get risk settings from the mode-level guardrails table.
