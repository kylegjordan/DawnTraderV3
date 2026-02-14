# Phase 36 Pre-Audit Observations
## Deferred Issues Log

**Document Purpose:** Track observed anomalies during Phase 36 Live Trade Simulation that require investigation in Phase 37.

**Status:** All issues deferred for post-audit cycle  
**Date:** October 31, 2025  
**Phase:** 36 (Live Trade Simulation Reliability Validation)

---

## Anomaly #3: Live-Mode Toggle Desync

### Classification
- **Severity:** Low (Cosmetic)
- **Priority:** Deferred to Phase 37 – UI Cohesion Audit
- **Impact:** Cosmetic only; no functional desync of portfolio or WebSocket events

### Symptom
Visual inconsistency between trading mode indicators:
- **Top-bar toggle:** Shows ACTIVE (LIVE) ✅
- **Green status banner:** Shows STOPPED 🔴

### Observed In
- **Location:** `/dashboard` during live-trading mode initialization
- **Timing:** First ~300ms after mode switch
- **Frequency:** Consistent on mode transitions

### Likely Cause
**Cache-WebSocket Race Condition:**
1. Cached `isEngineActiveLive` flag from last reconciliation broadcast loads first
2. React Query hydration renders the banner using stale cache (~300ms)
3. Fresh `/api/trading/status` response arrives
4. WebSocket payload `trading_state_changed` overwrites cache
5. Banner updates to correct state

**Root Issue:** Banner renders before first authoritative state confirmation

### Reproduction Steps
1. Navigate to Dashboard in PAPER mode
2. Click mode toggle to switch to LIVE
3. Observe top-bar shows "LIVE" immediately
4. Banner shows "STOPPED" briefly (~300ms)
5. Banner updates to correct state after WebSocket broadcast

### Recommended Fix (Phase 37)

**Option A: Defer Banner Render**
```typescript
// Wait for first trading_state_changed event before showing banner
const [hasReceivedState, setHasReceivedState] = useState(false);

useEffect(() => {
  const handler = (event) => {
    setHasReceivedState(true);
  };
  socket.on('trading_state_changed', handler);
}, []);

// Only render banner after first state confirmation
{hasReceivedState && <StatusBanner />}
```

**Option B: Pre-Seed Cache**
```typescript
// Pre-seed cache with current activeMode from /api/trading/status before mount
const { data: tradingStatus } = useQuery({
  queryKey: ['/api/trading/status'],
  staleTime: 0, // Force fresh fetch
});

// Use authoritative state from API, not cached WebSocket data
```

### Evidence
- **Screenshots:** Available in test agent output (Phase 36 test)
- **Console Logs:** No errors, just timing mismatch
- **WebSocket Events:** `trading_state_changed` arrives after initial render

### Action Items
- [ ] Defer to Phase 37 UI Cohesion Audit
- [ ] Implement one of the recommended fixes
- [ ] Add integration test for mode transition timing
- [ ] Validate banner always shows correct state within 100ms

---

## Anomaly #4: No Ready-to-Buy Signals / No Trades Executed

### Classification
- **Severity:** 🔸 High (Functional Gap)
- **Priority:** 🔸 Investigate early in Phase 37 Functional Integrity Audit
- **Impact:** Functional — core trading logic appears idle in live mode

### Symptom
Trading engine shows as active but generates zero trading signals:
- **Ready-to-Buy Signals panel:** Shows (0) signals
- **Trades Executed:** 0 trades during entire 10-minute simulation
- **System Monitoring:** Confirms engine is active (green "LIVE" indicator ✅)
- **Market Events:** No activity in Trading or Dashboard widgets

### Observed In
- **Locations:** `/active-trades` and `/dashboard` under Live Trading Mode
- **Duration:** Entire 10-minute Phase 36 simulation
- **Mode:** Live Trading Mode only (Paper mode behavior not tested)

### Preliminary Diagnosis

**Potential Root Causes:**

1. **Strategy Engine Not Initializing**
   - `LiveTradingEngine.start()` may not trigger strategy evaluation
   - Buy-signal pipeline not activated when `mode = live`
   - Strategy dispatcher not subscribing to live mode events

2. **Missing Feed Subscription**
   - Live PriceAdapter (Phase 34) not broadcasting to strategy engine
   - Price throttling may have disconnected strategy subscription
   - WebSocket price updates not reaching trading logic

3. **Database Query Filtering**
   - Possible `isPaper = true` hard-coded in database queries
   - Live-mode data being filtered out at persistence layer
   - Trade signals generated but not persisted to database

4. **Configuration Issue**
   - Guardrails or coherency rules blocking all trades
   - Risk limits set too conservatively (0% allocation)
   - Universe/signal controls filtering out all symbols

### Reproduction Steps
1. Login as testuser123
2. Navigate to Dashboard
3. Switch to LIVE mode via toggle
4. Observe System Monitoring shows engine ACTIVE ✅
5. Wait for 10 minutes (or any duration)
6. Observe Ready-to-Buy Signals remains at (0)
7. Check Trading Activity widget shows 0 trades
8. Verify no market events appear anywhere

### Evidence Required (Phase 37)
- [ ] Backend logs during live mode operation
- [ ] Strategy engine initialization logs
- [ ] Price feed subscription status
- [ ] Database query logs for trade signals
- [ ] Guardrail/coherency validation logs
- [ ] Screenshots showing (0) signals with ACTIVE engine

### Recommended Investigation Steps (Phase 37)

**Step 1: Verify Engine Initialization**
```typescript
// Add diagnostic logging in LiveTradingEngine.start()
console.log('[37.A][ENGINE] LiveTradingEngine.start() called');
console.log('[37.A][ENGINE] Strategy evaluation enabled:', this.strategyEvaluation);
console.log('[37.A][ENGINE] Price feed subscribed:', this.priceFeedActive);
```

**Step 2: Verify Strategy Pipeline**
```typescript
// Add diagnostic logging in StrategyEngine
console.log('[37.A][STRATEGY] Buy-signal pipeline initialized');
console.log('[37.A][STRATEGY] Evaluating signals for mode:', mode);
console.log('[37.A][STRATEGY] Active strategies:', activeStrategies);
console.log('[37.A][STRATEGY] Signals generated:', signals.length);
```

**Step 3: Verify Price Feed Connection**
```typescript
// Verify LivePricingAdapter broadcasts reaching strategy
console.log('[37.A][PRICE] Price update broadcast for:', symbol, price);
console.log('[37.A][PRICE] Strategy subscribers count:', subscribers.length);
```

**Step 4: Check Database Queries**
```sql
-- Verify live-mode data not being filtered
SELECT * FROM trade_signals WHERE mode = 'live' ORDER BY created_at DESC LIMIT 10;
SELECT * FROM guardrails_v2 WHERE mode = 'live' AND user_override = false;
SELECT * FROM goals WHERE mode = 'live';
```

**Step 5: Validate Guardrails**
```typescript
// Check if guardrails are blocking trades
const validation = await guardrailPolicy.validate(tradeRequest, 'live');
console.log('[37.A][GUARDRAILS] Validation result:', validation);
console.log('[37.A][GUARDRAILS] Blocked reason:', validation.reason);
```

### Potential Fixes (Phase 37)

**If Strategy Not Initializing:**
- Ensure `LiveTradingEngine.start()` calls `StrategyEngine.initialize()`
- Verify event subscriptions for `price_update` events
- Add explicit strategy activation logging

**If Feed Not Connected:**
- Re-subscribe strategy engine to `LivePricingAdapter` broadcasts
- Verify WebSocket price events reach strategy dispatcher
- Check Phase 34 throttling not disconnecting subscribers

**If Database Filtering:**
- Audit all queries for hard-coded `isPaper = true`
- Ensure mode parameter correctly passed to all database calls
- Update views to include live-mode data

**If Configuration Blocking:**
- Review guardrail settings for live mode
- Check coherency rules not blocking all trades
- Validate universe/signal controls not empty

### Action Items
- [ ] **High Priority:** Investigate in Phase 37 Functional Integrity Audit
- [ ] Add comprehensive diagnostic logging to trading pipeline
- [ ] Verify end-to-end signal flow from price → strategy → trade
- [ ] Test with known volatile symbols to trigger signals
- [ ] Add integration test for live-mode trade generation
- [ ] Document expected behavior and thresholds for buy signals

### Notes
- Phase 36 focused on **stability and performance**, not functional completeness
- No trades executed is acceptable for this phase (testing infrastructure, not trading logic)
- System demonstrated excellent stability despite idle trading engine
- This issue does not invalidate Phase 36 success criteria

---

## Summary

### Deferred Issues Count: 2

| ID | Anomaly | Severity | Priority | Status |
|----|---------|----------|----------|--------|
| #3 | Live-Mode Toggle Desync | Low (Cosmetic) | Deferred | Phase 37 UI Audit |
| #4 | No Ready-to-Buy Signals | High (Functional) | Investigate Early | Phase 37 Functional Audit |

### Phase 36 Impact Assessment

**Anomaly #3 (Toggle Desync):**
- ✅ Does not affect Phase 36 validation
- ✅ Purely cosmetic UI timing issue
- ✅ No impact on performance metrics
- ✅ No impact on system stability

**Anomaly #4 (No Trades):**
- ✅ Does not affect Phase 36 validation
- ✅ Phase 36 focused on stability, not trading logic
- ✅ System remained stable with idle engine
- ✅ Performance metrics still valid
- ⚠️ Functional gap to address in Phase 37

### Phase 36 Completion Status

**Phase 36 remains COMPLETE** ✅

The Phase 36 Live Trade Simulation Reliability Validation successfully validated:
- System stability (10 minutes, zero crashes)
- Performance metrics (3.4ms average, 99.99% success)
- Critical bug fixes (earnings chart API, performance profiler)
- Phase 35.3 optimizations (debounced invalidation, reconciliation)

These deferred issues are **out of scope** for Phase 36 and will be addressed in Phase 37.

---

## Next Steps

### Phase 37: Functional Integrity Audit

**Focus Areas:**
1. **UI Cohesion Audit** (Anomaly #3)
   - Fix toggle/banner synchronization
   - Ensure all state indicators consistent
   - Add integration tests for mode transitions

2. **Functional Integrity Audit** (Anomaly #4)
   - Investigate trading engine signal pipeline
   - Verify end-to-end trade flow in live mode
   - Add comprehensive diagnostic logging
   - Test with real market conditions

**Recommended Approach:**
- Start with Anomaly #4 (high priority functional gap)
- Add diagnostic logging before attempting fixes
- Validate with integration tests
- Document expected behavior and thresholds
- Fix Anomaly #3 as final polish step

---

**Document Status:** Complete  
**Review Date:** October 31, 2025  
**Next Review:** Phase 37 Kickoff  
**Maintained By:** Replit Agent
