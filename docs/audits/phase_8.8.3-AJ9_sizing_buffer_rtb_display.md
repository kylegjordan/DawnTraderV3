# Phase 8.8.3-AJ9: Intelligent Sizing Buffer & RTB Display Overhaul

## Date: December 3, 2025

## Summary
Implemented intelligent sizing buffer to prevent MAX_POSITION blocks from small price changes, and overhauled RTB metrics display to always show all block reasons and strategies regardless of zero counts.

---

## AJ9.1 - Intelligent Sizing Buffer

### Problem
Small price movements during execution could cause trades to be blocked by MAX_POSITION guardrail even though they were approved during sizing. For example:
- Sizing calculates quantity at $100/unit → 10 units = $1000 (exactly at max)
- Price rises to $101.50 during execution → $1015 > max → BLOCKED

### Solution
Added 3% sizing buffer (MAX_POSITION_BUFFER_FACTOR = 0.97):

```typescript
// server/services/paper-position-sizing.ts
const MAX_POSITION_BUFFER_FACTOR = 0.97; // 3% buffer

// Usage in sizing logic:
const bufferedMaxNotional = maxNotional * MAX_POSITION_BUFFER_FACTOR;
finalQuantity = Math.min(finalQuantity, bufferedMaxNotional / entryPrice);
```

### Files Modified
- `server/services/paper-position-sizing.ts`: Added buffer constant and clamping logic
- Type exports updated: `sizingDetails.bufferedMaxNotional` exposed

### Verification
```bash
# Backend confirms buffered max notional in sizing response
curl /api/position-sizing | jq '.sizingDetails.bufferedMaxNotional'
```

---

## AJ9.2 - Blocked Totals Consistency

### Problem
Total blocked count could mismatch sum of individual reason counts due to filtering issues.

### Solution
Backend already returns consistent `byReason` and `byStrategy` objects with all values populated. Frontend now uses these directly without transformation.

---

## AJ9.3 - All 13 Block Reasons Always Visible

### Implementation
Added constant array of all block reasons:

```typescript
const ALL_BLOCK_REASONS = [
  'ASSET_MAX_POSITIONS', 'COOLDOWN', 'FX_CONVERSION_FAILED',
  'INSUFFICIENT_BALANCE', 'KILL_SWITCH', 'LPCP_LOW_PRICE',
  'LPCP_MIN_NOTIONAL', 'MAX_EXPOSURE', 'MAX_POSITION',
  'MAX_TRADES', 'PORTFOLIO_RISK', 'STOP_LOSS_REQUIRED', 'UNKNOWN'
];
```

UI now iterates over this array, displaying all 13 reasons even when count is zero.

---

## AJ9.4 - All 9 Strategies Always Visible

### Implementation
Added constant array of all strategies:

```typescript
const ALL_STRATEGIES = [
  'abcd_long', 'breakout', 'dhma', 'liquidity_trap',
  'mean_reversion', 'range_trading', 'sma_trend_ride',
  'vwap_bounce', 'vwap_pullback'
];
```

Strategy chips now show all 9 strategies instead of limiting to top 5.

---

## AJ9.5 - Opened by Strategy Table

### New Feature
Added "Opened by Strategy (Last 24h)" table showing all 9 strategies with their opened trade counts.

```typescript
{ALL_STRATEGIES.map((strategy) => {
  const count = opened?.byStrategy?.[strategy] || 0;
  return (
    <TableRow key={strategy}>
      <TableCell>{formatStrategy(strategy)}</TableCell>
      <TableCell className={count > 0 ? "text-success" : "text-muted-foreground"}>
        {formatNumber(count)}
      </TableCell>
    </TableRow>
  );
})}
```

---

## AJ9.6 - Session-Based Metrics & LPCP Dormancy Preserved

### Session Metrics
- `isSessionActive` and `sessionStart` fields preserved from AJ8
- Metrics reset to zero when engine stops (session filtering)
- Verified: API returns `isSessionActive: false, sessionStart: null` when engine stopped

### LPCP Status
LPCP remains dormant per AJ8:
```typescript
// server/services/trade-safety.ts
async function checkLowPricedCoinProtection(...) {
  // Phase 8.8.3-AJ8: LPCP is DORMANT - always pass
  return { ok: true };
}
```

---

## API Verification

```bash
# All 13 block reasons returned:
curl /api/metrics/rtb-blocked-summary?mode=paper
# Response: byReason_count: 13, byStrategy_count: 9

# All 9 strategies in opened summary:
curl /api/metrics/rtb-opened-summary?mode=paper
# Response: byStrategy_count: 9, isSessionActive: false
```

---

## Files Modified
1. `server/services/paper-position-sizing.ts` - Sizing buffer
2. `client/src/components/trading/execution-metrics.tsx` - RTB display overhaul

## Testing Checklist
- [x] Backend returns all 13 block reasons with zero values
- [x] Backend returns all 9 strategies with zero values
- [x] Sizing buffer applied (bufferedMaxNotional in response)
- [x] Session-based metrics working (isSessionActive, sessionStart)
- [x] LPCP dormant (always returns ok: true)
- [x] UI displays all 13 reasons in table
- [x] UI displays all 9 strategies in chips
- [x] UI shows "Opened by Strategy" table

## Next Phase
Phase 8.8.3-AJ10 will address any remaining MAX_POSITION flow refinements if needed.
