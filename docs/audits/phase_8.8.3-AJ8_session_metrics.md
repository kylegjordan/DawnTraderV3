# Phase 8.8.3-AJ8: Session-Based RTB Metrics & LPCP Dormancy

## Date: 2025-12-03

## Summary
Implemented intelligent sizing support with session-based RTB metrics that reset when the engine stops, made LPCP dormant (structure preserved), and ensured complete display of all 13 block reasons and 9 strategies in Filter Insights.

---

## Changes Made

### 1. LPCP Made Dormant (`server/services/trade-safety.ts`)
- `checkLowPricedCoinProtection()` now immediately returns `{ ok: true }` 
- No LPCP blocking logic runs during trade execution
- Structure and interface preserved for future phases
- LPCP-related block reasons (LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL) still displayed in UI but will always show 0

### 2. Session-Based RTB Metrics (`server/storage.ts`)
- `getExecutionAttemptMetrics()` now accepts optional `sessionStart?: Date | null` parameter
- When `sessionStart` is null (engine stopped): Returns zeros for all metrics
- When `sessionStart` is valid: Only counts audits with `createdAt >= sessionStart`
- Added `isSessionActive` boolean to response for UI awareness
- Console logging for debugging: `[AJ8][METRICS]` prefix

### 3. Updated RTB Routes (`server/routes.ts`)
All RTB endpoints now use session-based filtering:

| Endpoint | Changes |
|----------|---------|
| `/api/metrics/execution-attempts/stats` | Imports `getEngineSessionStart`, passes sessionStart |
| `/api/metrics/rtb-summary` | Session-aware, includes `isSessionActive` and `sessionStart` in response |
| `/api/metrics/rtb-blocked-summary` | Session-aware, shows all 13 block reasons, all 9 strategies, limit increased to 10000 |
| `/api/metrics/rtb-opened-summary` | Session-aware, shows all 9 strategies, limit increased to 10000 |

### 4. Complete Breakdown Display
**13 Block Reasons (always displayed):**
- KILL_SWITCH, STOP_LOSS_REQUIRED, ASSET_MAX_POSITIONS, COOLDOWN
- MAX_POSITION, LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, FX_CONVERSION_FAILED
- PORTFOLIO_RISK, INSUFFICIENT_BALANCE, MAX_EXPOSURE, MAX_TRADES, UNKNOWN

**9 Strategies (always displayed):**
- vwap_pullback, abcd_long, sma_trend_ride, breakout
- mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma

---

## AJ8 Sizing Formula (Verified)
The existing implementation in `server/services/paper-position-sizing.ts` is mathematically equivalent to the AJ8 specification:

```
maxPositionValue = portfolio × maxPositionPercentPct
riskAmount = portfolio × portfolioRiskPerTradePct
riskQty = riskAmount / (price × stopLoss)
maxQty = maxPositionValue / price
quantity = min(riskQty, maxQty)
finalValue = quantity × price
```

---

## Test Results

### Engine Stopped (isSessionActive: false)
```json
{
  "success": true,
  "data": {
    "totalAttempts": 0,
    "opened": 0,
    "blocked": 0,
    "isSessionActive": false
  },
  "sessionStart": null
}
```

### All 13 Block Reasons Displayed
```json
{
  "byReason": {
    "KILL_SWITCH": 0,
    "STOP_LOSS_REQUIRED": 0,
    "ASSET_MAX_POSITIONS": 0,
    "COOLDOWN": 0,
    "MAX_POSITION": 0,
    "LPCP_LOW_PRICE": 0,
    "LPCP_MIN_NOTIONAL": 0,
    "FX_CONVERSION_FAILED": 0,
    "PORTFOLIO_RISK": 0,
    "INSUFFICIENT_BALANCE": 0,
    "MAX_EXPOSURE": 0,
    "MAX_TRADES": 0,
    "UNKNOWN": 0
  }
}
```

### All 9 Strategies Displayed
```json
{
  "byStrategy": {
    "vwap_pullback": 0,
    "abcd_long": 0,
    "sma_trend_ride": 0,
    "breakout": 0,
    "mean_reversion": 0,
    "range_trading": 0,
    "vwap_bounce": 0,
    "liquidity_trap": 0,
    "dhma": 0
  }
}
```

---

## RTB UI Formatting (Verified)
The `ready-to-buy-table.tsx` component already uses `Intl.NumberFormat` for comma formatting:
- Qty column: Uses `Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })`
- $ Value column: Uses `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`

---

## Files Modified
1. `server/services/trade-safety.ts` - LPCP made dormant
2. `server/storage.ts` - Session-based metrics filtering
3. `server/routes.ts` - RTB endpoints updated with session awareness

## Dependencies
- `getEngineSessionStart()` from `server/services/paper-execution-engine.ts`

## Backwards Compatibility
- LPCP structure preserved for future activation
- API responses include new fields (`isSessionActive`, `sessionStart`) but maintain existing structure
- No breaking changes to existing consumers
