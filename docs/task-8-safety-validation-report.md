# Task 8: Guardrails & Safety Validation Report

## Overview
**Status:** Testing In Progress  
**Date:** October 12, 2025  
**Objective:** Implement and validate all safety guardrails to ensure the system can never lose more than allowed and can automatically pause trading when thresholds are hit.

---

## Implemented Guardrails

### 1. Daily Loss Kill Switch ✅ (Pre-existing)
**Implementation:** `RiskManager.checkKillSwitch()`
- Monitors 24-hour portfolio loss percentage
- Warning threshold: 75% of kill switch limit (default 5.25% when kill switch = 7%)
- Kill switch threshold: 7% portfolio loss (configurable)
- **Actions on trigger:**
  - Closes all open trades immediately
  - Suspends trading (sets `tradingSuspended` flag)
  - Logs event to `kill_switch_events` table
  - Sends critical alert

### 2. Max 1 Position Per Asset ✅ (Task 8)
**Implementation:** `RiskManager.checkMaxPositionsPerAsset()`
- **Logic:** Checks if any active trade exists for the same base asset
- **Symbol normalization:** Strips USD/ZUSD and X prefix (e.g., XBTUSD → BTC)
- **Rejection message:** "🛡️ Safety: Already have an open position in {ASSET}. Max 1 position per asset allowed."

### 3. Position Size Cap ✅ (Task 8 - FIXED)
**Implementation:** `RiskManager.checkPositionSizeCap()`
- **Original bug:** Compared position value against `riskAmount * 2` (mixing units)
- **Fixed logic:** Compares position value against 10% of portfolio
- **Formula:** `positionValue = (quantity × entryPrice)`
- **Max allowed:** 10% of portfolio value
- **Rejection message:** Shows both percentage and dollar values

### 4. Stop-Loss Enforcement ✅ (Task 8)
**Implementation:** `RiskManager.checkStopLossRequired()`
- **Validation:**
  - Stop-loss must exist (`stopPrice` defined and non-zero)
  - Stop-loss must be below entry price for long positions
- **Rejection messages:**
  - "🛡️ Safety: Stop-loss is required for all trades"
  - "🛡️ Safety: Stop-loss must be below entry price for long positions"

### 5. Spot-Only Trading ✅ (Task 8)
**Implementation:** `KrakenService.addOrder()`
- **Checks before API submission:**
  - Block if `leverage` parameter is set (and not 'none')
  - Block if `oflags` contains margin flags (e.g., 'viqc')
- **Error thrown:** "🛡️ SAFETY BLOCK: Leverage/Margin trading is prohibited. This system only allows spot trading."
- **Logging:** Every order logs spot-only validation

### 6. Safety Telemetry ✅ (Task 8)
**Implementation:** New `safety_telemetry` table + storage methods
- **Tracked metrics:**
  - `dailyDrawdown`: % loss in last 24h
  - `exposurePercent`: % of portfolio in open positions
  - `openPositionCount`: Number of active positions
  - `portfolioValue`: Current portfolio value
- **Violation flags:**
  - `spotOnlyViolation`: Leverage/margin attempt
  - `positionLimitViolation`: Multiple positions same asset
  - `positionSizeViolation`: Position > 10% portfolio
  - `stopLossViolation`: Missing or invalid stop-loss
- **Storage methods:**
  - `createSafetyTelemetry()`
  - `getSafetyTelemetry(userId, filters)`

---

## Test Scenarios

### Scenario 1: Max 1 Position Per Asset
**Setup:**
- User has 1 active BTC/USD trade
- New BTC/USD signal generated

**Expected:** ❌ Trade rejected
**Actual:** _Testing pending_
**Reason:** "Already have an open position in BTC. Max 1 position per asset allowed."

---

### Scenario 2: Position Size Cap (10% Portfolio Limit)
**Setup:**
- Portfolio value: $50,000
- Max position: $5,000 (10%)
- Signal: BTC entry=$100, stop=$95, risk=$150
- Position size: $150 / $5 = 30 units
- Position value: 30 × $100 = $3,000 ✅ (6% of portfolio)

**Expected:** ✅ Trade approved (under 10% limit)
**Actual:** _Testing pending_

**Scenario 2b: Oversized Position**
- Portfolio value: $50,000
- Signal: BTC entry=$100, stop=$90, risk=$2,000
- Position size: $2,000 / $10 = 200 units
- Position value: 200 × $100 = $20,000 ❌ (40% of portfolio)

**Expected:** ❌ Trade rejected
**Actual:** _Testing pending_
**Reason:** "Position size (40.0% = $20,000) exceeds 10% portfolio limit ($5,000)"

---

### Scenario 3: Stop-Loss Enforcement
**Setup 3a:** Signal with no stop-loss
- Entry: $100
- Stop: 0 (missing)

**Expected:** ❌ Trade rejected
**Actual:** _Testing pending_
**Reason:** "Stop-loss is required for all trades"

**Setup 3b:** Invalid stop-loss (above entry)
- Entry: $100
- Stop: $105 (above entry for long)

**Expected:** ❌ Trade rejected
**Actual:** _Testing pending_
**Reason:** "Stop-loss must be below entry price for long positions"

---

### Scenario 4: Spot-Only Trading Enforcement
**Setup 4a:** Order with leverage
```javascript
krakenService.addOrder({
  pair: 'XBTUSD',
  type: 'buy',
  ordertype: 'market',
  volume: '0.1',
  leverage: '2' // ❌ Not allowed
})
```

**Expected:** ❌ Exception thrown
**Actual:** _Testing pending_
**Error:** "SAFETY BLOCK: Leverage trading is prohibited. This system only allows spot trading."

**Setup 4b:** Order with margin flag
```javascript
krakenService.addOrder({
  pair: 'XBTUSD',
  type: 'buy',
  ordertype: 'market',
  volume: '0.1',
  oflags: 'viqc' // ❌ Margin flag
})
```

**Expected:** ❌ Exception thrown
**Actual:** _Testing pending_

---

### Scenario 5: Daily Loss Kill Switch
**Setup:**
- Portfolio start: $50,000
- 24h realized loss: -$3,500 (7% loss)
- Kill switch threshold: 7%

**Expected:**
1. ✅ Kill switch triggers
2. ✅ All open trades closed
3. ✅ `tradingSuspended` flag set to `true`
4. ✅ Event logged to `kill_switch_events`
5. ✅ Critical alert sent

**Actual:** _Testing pending_

**Setup 5b: Warning Threshold**
- 24h loss: -$2,625 (5.25% - warning threshold at 75% of 7%)

**Expected:**
1. ✅ Warning event triggered
2. ❌ Trades NOT closed (warning only)
3. ✅ Warning logged to `kill_switch_events`

**Actual:** _Testing pending_

---

### Scenario 6: Safety Telemetry Logging
**Setup:** Execute any risk check

**Expected telemetry record:**
```json
{
  "userId": "test-user",
  "mode": "paper",
  "checkType": "pre_trade",
  "checkPassed": false,
  "failureReason": "Position limit violation",
  "dailyDrawdown": "2.35",
  "exposurePercent": "15.50",
  "openPositionCount": 2,
  "portfolioValue": "48825.00",
  "positionLimitViolation": true,
  "symbol": "BTC/USD",
  "strategy": "vwap_pullback"
}
```

**Actual:** _Testing pending_

---

## Pass Criteria

| Guardrail | Status | Notes |
|-----------|--------|-------|
| ✅ All guardrails trigger as expected | 🔄 Testing | Scenarios 1-6 pending execution |
| ✅ System auto-disables on daily loss | 🔄 Testing | Kill switch scenario pending |
| ✅ Spot-only restriction active | ✅ Implemented | KrakenService blocks leverage/margin |
| ✅ No unauthorized trades executed | 🔄 Testing | Integration test pending |
| ✅ Telemetry records all events | 🔄 Testing | Schema + storage ready, integration pending |

---

## Next Steps

1. **Execute Test Scenarios:** Run all scenarios in Paper mode
2. **Validate Telemetry:** Confirm safety_telemetry table receives data
3. **Integration Testing:** End-to-end trade flow with all guardrails active
4. **Performance Testing:** Verify guardrails don't impact signal processing speed
5. **Documentation Update:** Final report with all test results

---

## Implementation Files

### Modified Files:
- `server/services/risk-manager.ts` - Added 3 new guardrail checks
- `server/services/kraken.ts` - Added spot-only verification
- `shared/schema.ts` - Added safety_telemetry table
- `server/storage.ts` - Added safety telemetry methods

### Database Changes:
- New table: `safety_telemetry`
- Schema pushed: ✅ October 12, 2025

---

## Known Issues

### Fixed Issues:
1. ✅ **Position Size Cap Bug (CRITICAL)** - Fixed October 12
   - **Issue:** Compared position value ($3,000) against riskAmount * 2 ($300) - mixing units
   - **Fix:** Changed to 10% portfolio cap ($5,000 for $50K portfolio)
   - **Verified:** Logic now correct, units consistent

2. ✅ **Symbol Normalization Bug v1 (CRITICAL)** - Fixed October 12
   - **Issue:** XBTUSD normalized to "BT" but BTC/USD normalized to "BTC" - no match
   - **Impact:** Duplicate positions in same asset could slip through
   - **Fix:** Corrected order of replacements and added BT→BTC mapping

3. ✅ **Symbol Normalization Bug v2 (CRITICAL)** - Fixed October 12
   - **Issue:** Kraken's XXBTZUSD (double X prefix) became "XBTZ" - still didn't match
   - **Impact:** Max 1 position per asset could still be bypassed
   - **Fix:** Robust normalizer strips ALL X/Z prefixes, handles all Kraken variants
   - **Verified:** XXBTZUSD, XBTUSD, XBT/USD, BTC/USD all → "BTC" ✅

### Open Issues:
1. **Symbol Normalization Edge Cases** (Medium Priority)
   - **Issue:** Current normalizer handles BTC variants but may mismatch other assets
   - **Examples:** XDGUSD→"DG" vs DOGE/USD→"DOGE", XRP variants
   - **Impact:** Max 1 position per asset may not catch all duplicates
   - **Mitigation:** Use consistent symbol format in watchlist OR implement full Kraken alias mapping
   - **Recommendation:** Build comprehensive symbol parser with known alias table (XBT→BTC, XDG→DOGE, etc.)

2. **No Executed Testing** (High Priority)
   - **Issue:** All test scenarios marked "Testing pending" - no pass/fail evidence
   - **Impact:** Cannot confirm guardrails work end-to-end in production
   - **Recommendation:** Execute all scenarios in Paper mode, capture results with evidence

---

## Architect Review

### Review 1 (October 12, 2025)
**Status:** ❌ FAIL - Critical bug found
**Issue:** Position size cap mixing units (positionValue vs riskAmount)
**Resolution:** Fixed - now uses 10% portfolio cap

### Review 2 (Pending)
**Status:** Awaiting re-review of fixed guardrails before testing

---

## Appendix: Guardrail Flow

```
Trade Signal Generated
         ↓
  checkPreTradeRisk()
         ↓
    ┌────────────────────────┐
    │ Check 0: Kill Switch   │ → Trading suspended? REJECT
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 1: Balance       │ → Insufficient funds? REJECT
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 2: Risk Amount   │ → Risk too high/low? REJECT
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 3: Max Exposure  │ → Total exposure > limit? REJECT
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 4: Max Trades    │ → Too many open? REJECT
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 5: 1 Per Asset   │ → Duplicate asset? REJECT ⚡
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 6: Stop-Loss     │ → Missing/invalid SL? REJECT ⚡
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Check 7: Size Cap      │ → Position > 10%? REJECT ⚡
    └────────────────────────┘
         ↓
    ✅ ALL CHECKS PASSED
         ↓
    Execute Trade
         ↓
    KrakenService.addOrder()
         ↓
    ┌────────────────────────┐
    │ Spot-Only Check        │ → Leverage/margin? THROW ERROR ⚡
    └────────────────────────┘
         ↓
    Order Submitted to Kraken
         ↓
    Log Safety Telemetry ⚡

⚡ = Task 8 New Guardrails
```
