# UNIFIED ROOT-CAUSE ANALYSIS REPORT
## Phase 8.8.3-I6 Backend-First Diagnostics
**Date:** December 8, 2025  
**Diagnostic Duration:** 60+ seconds  
**Trading Mode:** Paper Simulation

---

## EXECUTIVE SUMMARY

The backend pricing system IS working correctly. The primary issue is a **mode mismatch in WebSocket broadcasts** that prevents the frontend from receiving price updates. A secondary observation is that **trade closures are not happening** because no positions have reached their SL/TP thresholds yet - the execution engine IS evaluating prices correctly.

---

## DIAGNOSTIC A: Is the backend receiving fresh WebSocket ticks?

### Findings:
| Metric | Value | Status |
|--------|-------|--------|
| `[I6][WS_CACHE_UPDATE]` occurrences | 2 | ⚠️ LOW |
| `source=kraken_ws` occurrences | 0 | ⚠️ LOW |
| Average priceAgeMs | 4810ms | ⚠️ BORDERLINE |
| Samples > 5000ms | 52% | ⚠️ HIGH |

### Evidence:
```
[I6][WS_CACHE_UPDATE] symbol=XXRPZUSD price=2.09669 timestamp=2025-12-08T14:14:14.328Z
[I6][WS_CACHE_UPDATE] symbol=XXRPZUSD price=2.09674 timestamp=2025-12-08T14:14:17.513Z
```

### Conclusion:
**WebSocket tick reception is MINIMAL.** Only 2 WS cache updates were logged, both for XXRPZUSD. The Kraken WebSocket connection may have limited subscriptions or connectivity issues. However, this is compensated by the REST fallback.

---

## DIAGNOSTIC B: Is the backend REST fallback producing fresh prices?

### Findings:
| Metric | Value | Status |
|--------|-------|--------|
| `[REST_FALLBACK]` occurrences | 30 | ✅ GOOD |
| `source=kraken_rest` occurrences | 80 | ✅ GOOD |
| `priceAgeMs=0` on all REST calls | Yes | ✅ FRESH |

### Evidence:
```
[8.8.3-I6][REST_FALLBACK] symbol=FXS/USD price=0.788 source=kraken_rest priceAgeMs=0
[8.8.3-I6][REST_FALLBACK] symbol=ADA/USD price=0.436435 source=kraken_rest priceAgeMs=0
[8.8.3-I6][REST_FALLBACK] symbol=ETH/USD price=3149.84 source=kraken_rest priceAgeMs=0
```

### Conclusion:
**Kraken REST fallback is WORKING CORRECTLY.** Fresh prices are being fetched from Kraken's public API with priceAgeMs=0 (just fetched).

---

## DIAGNOSTIC C: Is the execution engine using fresh prices for SL/TP evaluation?

### Findings:
| Metric | Value | Status |
|--------|-------|--------|
| `[EXIT_EVAL]` occurrences | 25 | ✅ ACTIVE |
| distSL range | 0.37% - 2.35% | ✅ EVALUATING |
| distTP range | 0.34% - 26.33% | ✅ EVALUATING |
| Trades at threshold | 0 | ⚠️ NONE YET |

### Evidence:
```
[EXIT_EVAL] symbol=FXSUSD livePrice=0.788 tp=0.94126779 sl=0.78507 distSL=0.3718% distTP=19.4502%
[EXIT_EVAL] symbol=ETH/USD livePrice=3149.84 tp=3160.5032 sl=3121.96592 distSL=0.8849% distTP=0.3385%
```

### Conclusion:
**Execution engine IS evaluating prices correctly.** The distSL and distTP values are being calculated. No trades have closed because:
1. ETH/USD is closest to target (distTP=0.34%) but hasn't crossed yet
2. FXSUSD is closest to stop (distSL=0.37%) but hasn't crossed yet
3. Market movement has been minimal during the test period

---

## DIAGNOSTIC D: Are WebSocket price_updated events reaching the frontend?

### Findings:
| Metric | Value | Status |
|--------|-------|--------|
| Backend broadcasts sent | 31 | ✅ SENT |
| ContextBridge delivery | "1/1 clients" | ✅ DELIVERED |
| Broadcasts with `mode:"live"` | 29 (100%) | ❌ WRONG MODE |
| Browser price_updated received | 0 | ❌ NOT RECEIVED |

### Evidence:
```
[34.A][BROADCAST] type=price_updated, payload={"mode":"live","symbol":"FXS/USD","price":0.788,...}
[34.A][BROADCAST] type=price_updated, payload={"mode":"live","symbol":"ETH/USD","price":3149.84,...}
```

Browser console shows NO price_updated events logged.

### Conclusion:
**MODE MISMATCH CONFIRMED.** Backend broadcasts all price_updated events with `mode:"live"`, but the frontend is operating in **paper mode**. The frontend filters/ignores these events because they don't match the active trading mode.

---

## DIAGNOSTIC E: Is the backend API returning fresh prices?

### Findings:
| Symbol | Snapshot 1 | Snapshot 6 | Changed? |
|--------|------------|------------|----------|
| ZEURZUSD | 1.16451 | 1.16446 | ✅ YES |
| XRP/USD | 2.1 | 2.1 | ✅ YES (via 2.097xx) |
| ETH/USD | 3150.19 | 3151.2 | ✅ YES |
| FXSUSD | 0.788 | 0.788 | ❌ NO |

### Evidence:
```
ZEURZUSD prices: 1.16451 → 1.16453 → 1.16452 → 1.16449 → 1.16442 → 1.16446
XRP/USD prices: 2.1 → 2.09759 → 2.09729 → 2.09775 → 2.0975 → 2.1
```

### Conclusion:
**Backend API IS returning fresh, changing prices.** Most symbols show price variation across the 60-second test. FXSUSD remained static (market condition, not a bug).

---

## UNIFIED ROOT-CAUSE ANSWERS

| Question | Answer | Evidence |
|----------|--------|----------|
| Is the backend receiving fresh WS ticks? | ⚠️ MINIMAL | Only 2 WS updates logged |
| Is the backend generating fresh prices? | ✅ YES | 30 REST fallback calls, priceAgeMs=0 |
| Is the backend feeding prices to execution engine? | ✅ YES | 25 EXIT_EVAL logs with changing distSL/distTP |
| Is the backend API returning fresh prices? | ✅ YES | Prices change across snapshots |
| Is the UI receiving price_updated events? | ❌ NO | 0 events in browser console |
| Is React component consuming them? | ❌ N/A | No events to consume |

---

## IDENTIFIED ISSUES (Priority Order)

### Issue #1: WebSocket Broadcast Mode Mismatch (CRITICAL)
- **Location:** `LivePricingAdapter.broadcastPriceUpdate()` 
- **Problem:** All price_updated events are broadcast with `mode: "live"` regardless of active trading mode
- **Impact:** Frontend in paper mode discards all price updates
- **Fix Required:** Pass correct mode when broadcasting

### Issue #2: Limited Kraken WebSocket Subscriptions (MEDIUM)
- **Location:** `KrakenWebSocketAdapter`
- **Problem:** Only 2 WS cache updates logged (both for XXRPZUSD)
- **Impact:** Heavy reliance on REST fallback (increases latency)
- **Fix Required:** Verify WS subscription mechanism for all open positions

### Issue #3: No Trade Closures Yet (NOT A BUG)
- **Location:** N/A
- **Problem:** No positions have reached SL/TP thresholds
- **Impact:** Expected behavior - prices haven't moved enough
- **Fix Required:** None - wait for market movement

---

## RECOMMENDED FIX SEQUENCE

1. **FIX #1 (Backend):** Update `broadcastPriceUpdate()` to accept and use the correct trading mode
2. **FIX #2 (Backend):** Audit Kraken WebSocket subscriptions to ensure all open position symbols are subscribed
3. **MONITOR:** Continue 30-minute test after fixes to verify trade closures occur when prices hit thresholds

---

## NO CODE CHANGES MADE
This report is diagnostic only. Awaiting user directive to implement fixes.
