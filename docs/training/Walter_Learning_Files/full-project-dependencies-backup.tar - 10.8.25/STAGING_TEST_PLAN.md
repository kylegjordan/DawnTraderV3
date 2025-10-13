# Staging Test Plan

## Overview

This document provides step-by-step procedures for manually validating all resilience features in the staging environment before production deployment.

**Prerequisites:**
- Staging environment configured (see `DEPLOYMENT_GUIDE.md`)
- Kraken test account with minimal funding ($100-500)
- Separate staging database instance
- Debug logging enabled
- All automated tests passing (20/20 tests)

---

## Test Suite Overview

| Test ID | Test Name | Priority | Duration | Pass Criteria |
|---------|-----------|----------|----------|---------------|
| ST-01 | Bracket Rollback Test | HIGH | 5 min | No orphaned orders |
| ST-02 | Partial Fill Recovery Test | HIGH | 10 min | Position scaled correctly |
| ST-03 | Rate Limit Stress Test | MEDIUM | 5 min | No 429 errors |
| ST-04 | Circuit Breaker Test | MEDIUM | 3 min | Trading suspended |
| ST-05 | Kill Switch Integration Test | HIGH | 15 min | Positions closed, analysis generated |
| ST-06 | Full Integration Test | HIGH | 20 min | Complete trade lifecycle |
| ST-07 | Resilience Stack Verification | MEDIUM | 10 min | All safeguards active |
| ST-08 | Exchange Constraints Test | LOW | 5 min | Invalid orders rejected |
| ST-09 | Retry Logic Test | LOW | 5 min | Transient errors recovered |
| ST-10 | Failover Logging Test | LOW | 5 min | Logs survive failures |

**Total Estimated Time:** 1.5 - 2 hours

---

## ST-01: Bracket Rollback Test

### Objective
Verify that when any part of a bracket order (entry, stop, target) fails, all placed orders are automatically cancelled with zero orphans.

### Prerequisites
- Trading mode: `live`
- Kraken account: Active with balance
- Staging environment running

### Procedure

**Step 1: Setup Test Signal**
```bash
# Access staging dashboard
# Navigate to: Settings → Trading Mode → Live

# Prepare test signal with intentionally invalid stop price
curl -X POST http://localhost:5000/api/test/trigger-bracket-rollback \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "XXBTZUSD",
    "strategy": "vwap_pullback",
    "entryPrice": 50000,
    "stopPrice": -100,
    "targetPrice": 51000,
    "invalidateField": "stop"
  }'
```

**Step 2: Monitor Execution**
```bash
# Tail logs in real-time
tail -f logs/staging/trading-$(date +%Y-%m-%d).log | grep "bracket"
```

**Expected Log Output:**
```
✅ Entry order placed: OXXXX-XXXXX-XXXXXX
✅ Target order placed: OXXXX-XXXXX-XXXXXX
❌ Stop order failed: EOrder:Invalid order price
⚠️ Bracket rollback initiated (2 orders to cancel)
✅ Cancelled order: OXXXX-XXXXX-XXXXXX (entry)
✅ Cancelled order: OXXXX-XXXXX-XXXXXX (target)
Bracket rollback complete: 2 orders cancelled successfully
```

**Step 3: Verify on Kraken**
```bash
# Check Kraken account for open orders
# Navigate to: Kraken → Trading → Open Orders
# Expected: ZERO open orders for this symbol
```

**Step 4: Verify Database**
```bash
# Query trades table
psql $STAGING_DATABASE_URL -c "
  SELECT id, status, metadata->>'bracketRollback' 
  FROM trades 
  WHERE symbol = 'XXBTZUSD' 
  ORDER BY created_at DESC 
  LIMIT 1;
"
```

**Expected Result:**
- Trade status: `failed` or `cancelled`
- Metadata contains: `"bracketRollback": true`
- Kraken account shows zero open orders
- No dangling orders left behind

### Pass Criteria
- [ ] All placed orders cancelled (verified in Kraken UI)
- [ ] Rollback logged with ✅/❌ indicators
- [ ] Trade marked as failed in database
- [ ] Metadata contains rollback audit trail

### Failure Scenarios to Test

1. **Entry Fails** (invalid price)
2. **Stop Fails** (price too close to entry)
3. **Target Fails** (insufficient balance)

Repeat test for each scenario.

---

## ST-02: Partial Fill Recovery Test

### Objective
Verify that when an order is filled less than the configured threshold (90%), the system detects it and takes appropriate recovery action (SCALE or CATCHUP).

### Prerequisites
- Trading mode: `live`
- Partial fill threshold: `0.90` (90%)
- Partial fill action: `SCALE` (test both SCALE and CATCHUP)

### Procedure

**Step 1: Configure Settings**
```bash
# Update trading settings
curl -X PATCH http://localhost:5000/api/settings/1 \
  -H "Content-Type: application/json" \
  -d '{
    "partialFillThreshold": "0.90",
    "partialFillAction": "SCALE"
  }'
```

**Step 2: Place Large Order**
```bash
# Find current order book depth
curl http://localhost:5000/api/kraken/orderbook/XXBTZUSD

# Place order larger than available depth
# Example: If order book has 0.5 BTC available, request 1.0 BTC
curl -X POST http://localhost:5000/api/test/trigger-partial-fill \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "XXBTZUSD",
    "strategy": "abcd_long",
    "entryPrice": 50000,
    "quantity": 1.0,
    "expectedFill": 0.5
  }'
```

**Step 3: Monitor Execution**
```bash
tail -f logs/staging/trading-$(date +%Y-%m-%d).log | grep "partial"
```

**Expected Log Output (SCALE mode):**
```
Entry order placed: 1.0 BTC requested
Order filled: 0.5 BTC (50% fill ratio)
⚠️ Partial fill detected: 50.0% < 90.0% threshold
Action: SCALE - Adjusting stops/targets for filled quantity
Original stop: 49500 @ 1.0 BTC
Scaled stop: 49500 @ 0.5 BTC
Original target: 51000 @ 1.0 BTC
Scaled target: 51000 @ 0.5 BTC
✅ Stop order placed (scaled): 0.5 BTC
✅ Target order placed (scaled): 0.5 BTC
```

**Step 4: Verify Kraken Orders**
- Check Kraken UI for stop-loss and take-profit orders
- Verify quantities match filled amount (0.5 BTC, not 1.0 BTC)

**Step 5: Test CATCHUP Mode**
```bash
# Update to CATCHUP action
curl -X PATCH http://localhost:5000/api/settings/1 \
  -H "Content-Type: application/json" \
  -d '{"partialFillAction": "CATCHUP"}'

# Repeat partial fill test
```

**Expected Log Output (CATCHUP mode):**
```
⚠️ Partial fill detected: 50.0% < 90.0% threshold
Action: CATCHUP - Attempting to fill remaining quantity
Attempting catchup order: 0.5 BTC @ market
✅ Catchup order filled: 0.5 BTC
Total filled: 1.0 BTC (100%)
✅ Stop order placed: 1.0 BTC
✅ Target order placed: 1.0 BTC
```

**Step 6: Verify Database**
```bash
psql $STAGING_DATABASE_URL -c "
  SELECT 
    quantity,
    metadata->>'partialFillDetected',
    metadata->>'partialFillRatio',
    metadata->>'partialFillAction'
  FROM trades
  WHERE symbol = 'XXBTZUSD'
  ORDER BY created_at DESC
  LIMIT 1;
"
```

### Pass Criteria
- [ ] Partial fill detected when < 90% threshold
- [ ] SCALE mode: Stops/targets adjusted to filled quantity
- [ ] CATCHUP mode: Additional order placed to fill gap
- [ ] Metadata contains complete audit trail
- [ ] No position size mismatches

---

## ST-03: Rate Limit Stress Test

### Objective
Verify that the rate limiter queues and throttles API requests to prevent Kraken API bans (max 2 requests/second).

### Procedure

**Step 1: Generate Request Burst**
```bash
# Send 50 API calls in rapid succession
for i in {1..50}; do
  curl -X GET http://localhost:5000/api/kraken/ticker/XXBTZUSD &
done
wait
```

**Step 2: Monitor Queue**
```bash
# Check rate limiter status
curl http://localhost:5000/api/resilience/rate-limit-status
```

**Expected Response:**
```json
{
  "requestsPerSecond": 2,
  "queueDepth": 0,
  "totalProcessed": 50,
  "totalQueued": 48,
  "averageWaitTime": "12s",
  "peakQueueDepth": 48
}
```

**Step 3: Verify No 429 Errors**
```bash
# Check logs for rate limit errors
grep "429" logs/staging/trading-$(date +%Y-%m-%d).log
# Expected: No results
```

**Step 4: Measure Throughput**
```bash
# Calculate actual rate
# 50 requests should take ~25 seconds (50 / 2 = 25)
# Start time: T0
# End time: T1
# Expected: T1 - T0 ≈ 25 seconds
```

### Pass Criteria
- [ ] All 50 requests processed successfully
- [ ] No 429 (rate limit) errors from Kraken
- [ ] Throughput ≈ 2 requests/second
- [ ] Queue handled burst without failures

---

## ST-04: Circuit Breaker Test

### Objective
Verify that after N consecutive failures (default 5), the circuit breaker opens and suspends trading for the configured timeout (60 seconds).

### Procedure

**Step 1: Force API Failures**
```bash
# Temporarily point to invalid Kraken URL to force failures
curl -X POST http://localhost:5000/api/test/force-api-failures \
  -H "Content-Type: application/json" \
  -d '{"failureCount": 5}'
```

**Step 2: Monitor Circuit Breaker**
```bash
tail -f logs/staging/trading-$(date +%Y-%m-%d).log | grep "circuit"
```

**Expected Log Output:**
```
API call failed (1/5): ECONNREFUSED
API call failed (2/5): ECONNREFUSED
API call failed (3/5): ECONNREFUSED
API call failed (4/5): ECONNREFUSED
API call failed (5/5): ECONNREFUSED
🔴 Circuit breaker OPENED (5 consecutive failures)
Trading suspended for 60 seconds
```

**Step 3: Verify Suspension**
```bash
# Attempt API call during suspension
curl -X GET http://localhost:5000/api/kraken/ticker/XXBTZUSD
```

**Expected Response:**
```json
{
  "error": "Circuit breaker is OPEN. Trading suspended.",
  "reason": "5 consecutive API failures",
  "reopensAt": "2025-10-04T12:35:00Z",
  "secondsRemaining": 45
}
```

**Step 4: Wait for Recovery**
```bash
# Wait 60 seconds, monitor logs
# Expected after timeout:
```

**Expected Log Output:**
```
⏱️ Circuit breaker timeout elapsed (60s)
🟢 Circuit breaker CLOSED (attempting recovery)
✅ API call successful - circuit breaker reset
```

**Step 5: Verify Normal Operation**
```bash
# API calls should work again
curl -X GET http://localhost:5000/api/kraken/ticker/XXBTZUSD
# Expected: Success
```

### Pass Criteria
- [ ] Circuit opens after configured failures (5)
- [ ] All requests rejected during suspension
- [ ] Circuit closes after timeout (60s)
- [ ] Normal operation resumes after recovery

---

## ST-05: Kill Switch Integration Test

### Objective
Verify that when daily losses exceed the configured threshold (5% in staging), the kill switch activates, closes all positions, and generates AI incident analysis.

### Procedure

**Step 1: Configure Kill Switch**
```bash
# Set low threshold for testing
curl -X PATCH http://localhost:5000/api/settings/1 \
  -H "Content-Type: application/json" \
  -d '{
    "dailyLossLimit": "0.05",
    "warningLossLimit": "0.0375"
  }'
```

**Step 2: Open Test Position**
```bash
# Place a trade that will generate loss
curl -X POST http://localhost:5000/api/test/place-losing-trade \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "XXBTZUSD",
    "entryPrice": 50000,
    "stopPrice": 47500,
    "quantity": 0.1,
    "triggerStop": true
  }'
```

**Step 3: Monitor Kill Switch**
```bash
tail -f logs/staging/trading-$(date +%Y-%m-%d).log | grep "kill"
```

**Expected Log Output:**
```
⚠️ Warning threshold reached: -3.8% (trigger: -3.75%)
🔴 Kill switch triggered: -5.2% loss exceeds -5.0% threshold
Emergency: Closing all open positions
Position closed: XXBTZUSD @ market (0.1 BTC)
All positions closed (1 trades)
Trading suspended by kill switch
Generating AI incident analysis...
```

**Step 4: Verify Database Event**
```bash
psql $STAGING_DATABASE_URL -c "
  SELECT 
    event_type,
    daily_loss_pct,
    open_positions_closed,
    metadata->>'aiAnalysisGenerated'
  FROM kill_switch_events
  ORDER BY triggered_at DESC
  LIMIT 1;
"
```

**Expected Result:**
- Event type: `triggered`
- Daily loss: ≈ -5.2%
- Positions closed: 1
- AI analysis: `true`

**Step 5: Verify AI Analysis**
```bash
# Check AI reports
curl http://localhost:5000/api/ai/reports?type=kill_switch
```

**Expected Response:**
```json
{
  "reportId": "...",
  "type": "kill_switch_analysis",
  "summary": "Kill switch activated due to -5.2% daily loss...",
  "recommendations": [
    "Review position sizing strategy",
    "Consider tighter stop losses",
    "Evaluate market volatility conditions"
  ],
  "trades_analyzed": 1
}
```

**Step 6: Test Recovery**
```bash
# Manually recover (after review)
curl -X POST http://localhost:5000/api/trading/kill-switch-recover \
  -H "Content-Type: application/json" \
  -d '{"confirmedReview": true}'
```

### Pass Criteria
- [ ] Kill switch activates at configured threshold
- [ ] All open positions closed immediately
- [ ] Trading suspended automatically
- [ ] AI incident analysis generated
- [ ] Event logged in database
- [ ] Manual recovery possible after review

---

## ST-06: Full Integration Test

### Objective
Execute a complete trade lifecycle with all resilience features active to verify end-to-end functionality.

### Procedure

**Step 1: Enable All Safeguards**
```bash
# Verify resilience config
curl http://localhost:5000/api/resilience/config
```

**Expected Response:**
```json
{
  "bracketRollback": true,
  "partialFillRecovery": true,
  "rateLimiting": true,
  "retryLogic": true,
  "circuitBreaker": true,
  "exchangeConstraints": true,
  "failoverLogging": true
}
```

**Step 2: Execute Normal Trade**
```bash
# Place a valid trade with all safeguards
curl -X POST http://localhost:5000/api/trades \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "XXBTZUSD",
    "strategy": "vwap_pullback",
    "mode": "live"
  }'
```

**Step 3: Monitor Complete Lifecycle**
```bash
tail -f logs/staging/trading-$(date +%Y-%m-%d).log
```

**Expected Log Sequence:**
```
1. Pre-trade risk checks passed
2. Exchange constraints validated (tick size, min notional)
3. Rate limiter: Request queued
4. Rate limiter: Processing request (1/2 per second)
5. ✅ Entry order placed: OXXXX-XXXXX-XXXXXX
6. ✅ Stop order placed: OXXXX-XXXXX-XXXXXX
7. ✅ Target order placed: OXXXX-XXXXX-XXXXXX
8. Bracket complete: 3 orders active
9. Position monitoring started
10. Trade logged to database
11. WebSocket notification sent
12. Failover log written to file
```

**Step 4: Verify Each Component**

**Risk Manager:**
```bash
curl http://localhost:5000/api/risk/check/1
# Should show trade within limits
```

**Exchange Constraints:**
```bash
# Check order prices match tick size
psql $STAGING_DATABASE_URL -c "
  SELECT entry_price, stop_price, target_price
  FROM trades
  ORDER BY created_at DESC
  LIMIT 1;
"
# Prices should be rounded to 0.1 for BTC
```

**Rate Limiting:**
```bash
curl http://localhost:5000/api/resilience/rate-limit-status
# Should show requests processed at ≤2/sec
```

**Failover Logging:**
```bash
# Verify log file exists
ls -lh logs/staging/trading-$(date +%Y-%m-%d).log
# Should show recent timestamp
```

**Step 5: Close Trade**
```bash
# Wait for target or manually close
curl -X POST http://localhost:5000/api/trades/1/close
```

**Expected:**
- Stop order cancelled
- Target order executed (or cancelled)
- Trade marked as closed
- P&L calculated and logged

### Pass Criteria
- [ ] All pre-trade checks passed
- [ ] Exchange constraints validated
- [ ] Rate limiting active
- [ ] Bracket orders placed successfully
- [ ] All safeguards logged
- [ ] Trade lifecycle complete
- [ ] Database records accurate
- [ ] No errors or exceptions

---

## ST-07: Resilience Stack Verification

### Objective
Verify that all resilience features are properly initialized and functioning together.

### Procedure

**Step 1: System Status Check**
```bash
curl http://localhost:5000/api/system/resilience-status
```

**Expected Response:**
```json
{
  "status": "healthy",
  "components": {
    "bracketRollback": {
      "enabled": true,
      "status": "active"
    },
    "partialFillRecovery": {
      "enabled": true,
      "threshold": 0.90,
      "action": "SCALE"
    },
    "rateLimiter": {
      "enabled": true,
      "requestsPerSecond": 2,
      "queueDepth": 0
    },
    "retryHandler": {
      "enabled": true,
      "maxRetries": 3,
      "successRate": 0.98
    },
    "circuitBreaker": {
      "enabled": true,
      "state": "CLOSED",
      "failureCount": 0
    },
    "exchangeValidator": {
      "enabled": true,
      "lastValidation": "2025-10-04T12:00:00Z"
    },
    "failoverLogger": {
      "enabled": true,
      "logFile": "logs/staging/trading-2025-10-04.log"
    }
  }
}
```

**Step 2: Integration Test**
```bash
# Run automated integration test
NODE_ENV=staging tsx server/test-resilience-integration.ts
```

**Expected Output:**
```
Running Resilience Stack Integration Test...

✅ Bracket rollback: READY
✅ Partial fill recovery: READY
✅ Rate limiting: READY (2/sec)
✅ Retry logic: READY (max 3)
✅ Circuit breaker: READY (threshold 5)
✅ Exchange constraints: READY
✅ Failover logging: READY

All 7 resilience features operational
```

### Pass Criteria
- [ ] All components report "enabled"
- [ ] No errors in system status
- [ ] Integration test passes
- [ ] Logs show all features active

---

## ST-08 through ST-10: Additional Tests

### ST-08: Exchange Constraints Test
- Verify tick size rounding (BTC: 0.1, ETH: 0.01)
- Verify minimum notional ($10 minimum)
- Verify quantity limits

### ST-09: Retry Logic Test
- Force timeout errors (3 retries with exponential backoff)
- Verify successful recovery after transient failure
- Verify non-retryable errors fail immediately

### ST-10: Failover Logging Test
- Temporarily disable database connection
- Verify logs still written to file
- Verify dual logging (file + console) works

*(Detailed procedures similar to above tests)*

---

## Post-Testing Checklist

After completing all tests:

- [ ] All 10 tests passed
- [ ] No orphaned orders in Kraken account
- [ ] Database records match expected state
- [ ] Logs contain complete audit trail
- [ ] AI analysis generated correctly
- [ ] No unexpected errors in logs
- [ ] System returned to normal state
- [ ] Staging database cleaned (optional)

## Test Results Documentation

Create test report:
```bash
# Generate test report
NODE_ENV=staging tsx server/generate-test-report.ts > staging-test-results.txt
```

**Include in report:**
- Test execution date/time
- Pass/fail status for each test
- Screenshots of key verifications
- Log excerpts showing expected behavior
- Any anomalies or edge cases discovered
- Recommendations for production deployment

---

## Approval

**Tested By:** ___________________  
**Date:** ___________________  
**Architect Approval:** ___________________  
**Production Deploy Authorized:** [ ] YES [ ] NO

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**Version**: 2.1.0  
**Last Updated**: October 4, 2025
