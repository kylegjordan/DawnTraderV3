# Phase 8.8.3-I6 Backend-First Diagnostics Report
**Date:** December 8, 2025  
**Session Duration:** 60 seconds live simulation capture  
**Open Positions:** 11 active trades  

---

## Executive Summary

This diagnostic session captured 60 seconds of live trading simulation data to analyze the live price distribution pipeline from end-to-end. **The results reveal two critical issues that must be fixed in sequence:**

1. **REST Fallback is Broken** - Returns stale cached prices instead of fetching fresh data from Kraken API
2. **WebSocket Broadcast Gap** - Backend broadcasts `price_updated` events but 0 reach the browser console

---

## Diagnostic Results

### Diagnostic 1: Trade Engine Receives Updated Prices
**Result: PARTIAL SUCCESS - Prices received but mostly stale**

```
[PRICE_TICK] symbol=XTZUSDT diff_ms=2939 source=last_known_good
[PRICE_TICK] symbol=ZUSDZJPY diff_ms=2942 source=last_known_good
[PRICE_TICK] symbol=ZEURZUSD diff_ms=2944 source=kraken_ws
```

**Findings:**
- Average `diff_ms` = 2988.92ms across 13 samples (within expected 1.5-3s interval)
- **Only 2 out of 26 price ticks came from `kraken_ws`** (7.7%)
- **24 out of 26 price ticks used `last_known_good`** (92.3%) - stale cache fallback

---

### Diagnostic 2: SL/TP Evaluation Runs with Fresh Prices
**Result: PARTIAL SUCCESS - Evaluation runs but with stale prices**

```
[8.8.3-I6][EXIT_EVAL] symbol=XTZUSDT livePrice=0.4878 tp=0.51 sl=0.478 distTP=4.5597% distSL=1.9799%
[8.8.3-I6][EXIT_EVAL] symbol=XTZUSDT livePrice=0.4878 tp=0.51 sl=0.478 distTP=4.5597% distSL=1.9799%
```

**Findings:**
- EXIT_EVAL fired 12 times during 60-second capture
- distTP and distSL values **remain identical** across multiple evaluations
- **Price is not changing** because it's using stale `last_known_good` cache

---

### Diagnostic 3: Price Cache Receives Updates During Trading
**Result: FAILED - Cache not receiving fresh updates**

```
[27.F.15.D][Pricing] Cache stale for XTZ/USD (age: 6633ms > 5000ms), falling back to REST
[B9.PRICING][LAST_KNOWN_GOOD] XTZ/USD: Using cached price $0.49 (source: last_known_good)
```

**Findings:**
- Cache staleness threshold: 5000ms
- Actual cache age: 6633ms+ (exceeds threshold)
- REST fallback triggers but **returns same stale price from cache**
- Cache is not being refreshed by WebSocket updates

---

### Diagnostic 4: Split-Brain Cache Scenario
**Result: CONFIRMED NO SPLIT-BRAIN**

**Architecture Verification:**
```typescript
// live-pricing-adapter.ts - Line 606
export const livePricingAdapter = new LivePricingAdapter();  // SINGLETON

// kraken-websocket-adapter.ts - Line 945  
export const krakenWebSocketAdapter = new KrakenWebSocketAdapter();  // SINGLETON
```

**Findings:**
- Both adapters use singleton pattern (exported instances)
- Paper execution engine imports these singletons correctly
- **No split-brain possible** - same cache instance used everywhere

---

### Diagnostic 5: WebSocket Broadcast to UI Pipeline
**Result: FAILED - Broadcasts not reaching browser**

| Metric | Count |
|--------|-------|
| Backend `price_updated` broadcasts | 2 |
| Browser console `price_updated` received | **0** |
| Frontend `trading_state_changed` received | 15+ |

**Findings:**
- Backend sends `price_updated` events via `[34.A][BROADCAST]`
- Frontend WebSocket **does receive** `trading_state_changed` events
- Frontend WebSocket **does NOT receive** `price_updated` events
- Possible cause: Event type filtering in WebSocket client or component mounting issues

---

### Diagnostic 6: REST Fallback Returns Fresh Prices
**Result: FAILED - REST returns stale cached prices**

**REST API Response Over 25 Seconds (5 iterations):**
| Time | XTZUSDT | SUI/USD | ZUSDZJPY |
|------|---------|---------|----------|
| 12:29:53 | 0.4878 | 1.6216 | 155.608 |
| 12:29:59 | 0.4878 | 1.6216 | 155.608 |
| 12:30:04 | 0.4878 | 1.6216 | 155.608 |
| 12:30:10 | 0.4878 | 1.6216 | 155.608 |
| 12:30:16 | 0.4878 | 1.6216 | 155.608 |

**Findings:**
- **Prices remain identical over 25+ seconds** - no market is this stable
- REST fallback is NOT fetching fresh prices from Kraken API
- It returns `last_known_good` cache value regardless of staleness
- This explains why SL/TP evaluation never hits triggers

---

## Root Cause Analysis

### Issue #1: REST Fallback Broken (Priority: CRITICAL)
**Location:** `live-pricing-adapter.ts` → `getPriceWithFallback()` method

The REST fallback mechanism is supposed to:
1. Check if WebSocket price is fresh (< 5000ms)
2. If stale, fetch fresh price from Kraken REST API
3. Update cache and return fresh price

**Current Behavior:**
1. WebSocket price is stale (> 5000ms)
2. Fallback triggers but returns **same stale cache value**
3. No actual REST API call to Kraken occurs

**Evidence:**
```
[27.F.15.D][Pricing] Cache stale for XTZ/USD (age: 6633ms > 5000ms), falling back to REST
[B9.PRICING][LAST_KNOWN_GOOD] XTZ/USD: Using cached price $0.49 (source: last_known_good)
```
The `[B9.PRICING][LAST_KNOWN_GOOD]` log shows the fallback is using cache, not fresh REST data.

---

### Issue #2: WebSocket Broadcast Gap (Priority: HIGH)
**Location:** Frontend WebSocket handler or `active-trades-v2.tsx` component

**Current Behavior:**
- Backend broadcasts `price_updated` events correctly
- Other event types (`trading_state_changed`) are received by frontend
- `price_updated` events are NOT visible in browser console

**Possible Causes:**
1. Event type filtering in WebSocket client (not subscribed to `price_updated`)
2. Component mounting issue (ActiveTradesV2 only receives when tab is active)
3. WebSocket message format mismatch

---

## Recommended Fix Sequence

### Step 1: Fix REST Fallback (Critical Path)
**Goal:** Ensure `getPriceWithFallback()` actually fetches fresh prices when cache is stale

```typescript
// In getPriceWithFallback(), when cache is stale:
// - Call Kraken REST API directly for fresh price
// - Update cache with fresh price
// - Return fresh price with source: 'rest_fallback'
```

### Step 2: Fix WebSocket Message Propagation
**Goal:** Ensure `price_updated` events reach frontend components

1. Verify WebSocket client subscribes to `price_updated` events
2. Ensure ActiveTradesV2 receives updates regardless of mount state
3. Add diagnostic logging in frontend WebSocket handler

### Step 3: Validate End-to-End
**Goal:** Run another 60-second diagnostic to confirm fixes

Expected outcomes after fix:
- `source=rest_fallback` when WebSocket stale
- Prices change every 5-15 seconds in REST API response
- `price_updated` events visible in browser console

---

## Data Summary Table

| Diagnostic | Expected | Actual | Status |
|------------|----------|--------|--------|
| D1: Engine receives prices | Fresh every 1.5s | Stale (source=last_known_good 92%) | PARTIAL |
| D2: SL/TP evaluation runs | Changes per price | Static distTP/distSL | PARTIAL |
| D3: Cache receives updates | Fresh from WS | 2 WS vs 24 stale | FAILED |
| D4: No split-brain | Single instance | Confirmed singleton | PASS |
| D5: WS broadcasts reach UI | price_updated received | 0 received | FAILED |
| D6: REST fallback fresh | Fresh from Kraken | Same stale values 25s | FAILED |

---

## Files to Modify

1. **`server/live-pricing-adapter.ts`** - Fix `getPriceWithFallback()` to actually call REST API
2. **`client/src/hooks/use-websocket.tsx`** - Verify `price_updated` subscription
3. **`client/src/components/trading/active-trades-v2.tsx`** - Verify WebSocket message handler

---

## Next Steps

1. Review `live-pricing-adapter.ts` → `getPriceWithFallback()` implementation
2. Add REST API call to Kraken when cache is stale
3. Re-run 60-second diagnostic to validate fix
4. Address WebSocket broadcast gap after REST fix is validated
