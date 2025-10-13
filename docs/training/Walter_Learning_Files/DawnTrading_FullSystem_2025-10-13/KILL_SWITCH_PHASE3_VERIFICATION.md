# Phase 3: Strategy & Guardrail Re-Verification

## Objective
Confirm that kill switch integration has not disrupted existing strategy detection or guardrail enforcement.

## Verification Summary

### ✅ 1. Strategies Pull Database Settings (Not Hardcoded)

**Files Verified**:
- `server/services/strategy-engine.ts`

**VWAP Pullback Strategy** (lines 26-37):
```typescript
const pullbackThreshold = parseFloat(settings.vwapPullbackThreshold || '2.0') / 100;
const volumeMultiplier = parseFloat(settings.vwapVolumeMultiplier || '1.5');
const maxHoldingPeriod = settings.vwapMaxHoldingPeriod || 24;
```

**ABCD Long Strategy** (lines 88-94):
```typescript
const minConsolidation = settings.abcdMinConsolidation || 10;
const breakoutThreshold = parseFloat(settings.abcdBreakoutThreshold || '1.5') / 100;
const volumeMultiplier = parseFloat(settings.abcdVolumeMultiplier || '1.5');
const exitType = settings.abcdExitType || 'target';
```

**SMA Trend Ride Strategy** (lines 185-189):
```typescript
const entryCondition = settings.smaEntryCondition || 'above';
const exitCondition = settings.smaExitCondition || 'break';
const trailingStopPercent = parseFloat(settings.smaTrailingStopPercent || '2.0') / 100;
const smaLength = settings.smaLength || 20;
```

**Conclusion**: ✅ All strategies read parameters from database settings, not hardcoded values.

---

### ✅ 2. Signals Produced Only for Screener-Eligible Pairs

**File**: `server/services/market-scanner.ts`

**Screener Flow** (lines 73-83):
```typescript
const eligiblePairs = await this.kraken.getEligiblePairs({
  minVolume: settings.minVolume || '30000000',
  minDailyRange: settings.minDailyRange || '6.5',
  minPrice: settings.minPrice || undefined,
  maxBidAskSpread: settings.maxBidAskSpread || undefined,
  excludeStablecoins: settings.excludeStablecoins ?? undefined,
  allowedTradingPairs: settings.allowedTradingPairs || undefined,
  blacklistedSymbols: settings.blacklistedSymbols || undefined,
  whitelistedSymbols: settings.whitelistedSymbols || undefined,
  minHistoryDays: settings.minDataHistoryDays || 90
});
```

**Signal Generation** (lines 173-178):
```typescript
for (const pair of watchlist) {
  await this.analyzeSymbolForSignals(userId, pair, settings);
  // ...
}
```

**Conclusion**: ✅ Only pairs that pass screener filters are added to watchlist and analyzed for signals.

---

### ✅ 3. Guardrails Behave as Before

**File**: `server/services/risk-manager.ts`

**Pre-Trade Risk Checks** (lines 11-49):
```typescript
async checkPreTradeRisk(userId, signal, settings) {
  // Check 0: Trading suspended (NEW - kill switch)
  if (settings.tradingSuspended) { return { approved: false, ... }; }
  
  // Check 1: Available balance (UNCHANGED)
  const balanceCheck = await this.checkAvailableBalance(...);
  
  // Check 2: Risk per trade (UNCHANGED)
  const riskCheck = await this.checkRiskPerTrade(...);
  
  // Check 3: Maximum concurrent exposure (UNCHANGED)
  const exposureCheck = await this.checkMaxExposure(...);
  
  // Check 4: Maximum open trades (UNCHANGED)
  const maxTradesCheck = await this.checkMaxOpenTrades(...);
  
  return { approved: true };
}
```

**Guardrail Checks**:
- ✅ **Risk Per Trade** (lines 88-109): Validates `settings.riskPerTrade` within acceptable range
- ✅ **Max Exposure** (lines 111-141): Calculates current exposure and enforces `settings.maxExposurePercent`
- ✅ **Max Open Trades** (lines 143-154): Limits concurrent positions to `settings.maxOpenTrades`
- ✅ **Slippage Tolerance** (trading-engine.ts lines 78-80): Enforces tier-based slippage limits
- ✅ **Stop Buffer** (trading-engine.ts lines 160-164): Applies `settings.stopBufferPercent` to stop orders

**Conclusion**: ✅ Kill switch adds one pre-check (Check 0) but does not modify existing guardrail logic.

---

### ✅ 4. Kill Switch Does Not Interfere with Normal Trading Flow

**When Trading is NOT Suspended**:

1. **Market Scan** → Screener filters applied → Eligible pairs added to watchlist
2. **Signal Detection** → `tradingSuspended` check (line 168) → **PASSES** → Strategies run normally
3. **Trade Execution** → Risk checks (Check 0) → **PASSES** → Remaining guardrails enforced
4. **Post-Trade** → Kill switch monitoring → Warning only if losses approach threshold

**When Trading IS Suspended**:

1. **Market Scan** → Screener filters applied → Eligible pairs added to watchlist
2. **Signal Detection** → `tradingSuspended` check (line 168) → **FAILS** → Log: "🚨 Skipped" → Exit
3. **Trade Execution** → Risk checks (Check 0) → **FAILS** → Trade rejected with clear reason

**Conclusion**: ✅ Kill switch integration adds fail-fast checks without modifying core trading logic.

---

### ✅ 5. Warning Trigger is Non-Blocking

**File**: `server/services/risk-manager.ts`

**Warning Logic** (lines 266-272):
```typescript
if (lossPercent >= warningThreshold && lossPercent < killThreshold) {
  console.log(`⚠️ WARNING: Daily loss approaching kill switch limit`);
  console.log(`   Current: -${lossPercent.toFixed(2)}% | Warning: -${warningThreshold.toFixed(2)}% | Kill: -${killThreshold.toFixed(2)}%`);
  
  return {
    triggered: true,
    type: 'warning',
    // ... (no tradingSuspended flag set)
  };
}
```

**Behavior**:
- Warning threshold triggers console log only
- Does NOT set `tradingSuspended = true`
- Does NOT close positions
- Trading continues normally

**Kill Logic** (lines 274-299):
```typescript
if (lossPercent >= killThreshold) {
  console.log(`🚨 KILL SWITCH ACTIVATED`);
  await this.triggerKillSwitch(userId, settings, /* ... */);
  return { triggered: true, type: 'kill', /* ... */ };
}
```

**Conclusion**: ✅ Warning alerts user without blocking trades. Only kill threshold suspends trading.

---

## Integration Impact Assessment

| Component | Changed? | Impact | Verification |
|-----------|----------|--------|--------------|
| **Screener Filters** | ❌ No | None | Settings-driven as before |
| **Strategy Detection** | ✅ Yes | Early-exit if suspended | Non-disruptive check |
| **Risk Guardrails** | ✅ Yes | Added Check 0 (kill switch) | All other checks unchanged |
| **Trade Execution** | ❌ No | None | Standard flow preserved |
| **Position Management** | ✅ Yes | Emergency closure on kill | Only when threshold exceeded |
| **Settings & UI** | ✅ Yes | Added kill switch fields | Backward compatible defaults |

## Test Scenarios

### Scenario A: Warning (Non-Blocking)
**Setup**: Set kill switch to 7%, warning to 75% (triggers at -5.25%)

**Expected**:
```
POST /api/test/simulate-loss
{ "scenario": "warning" }

Response:
{
  "killSwitchResult": { "type": "warning", "triggered": true },
  "tradingSuspended": false,  // ← Still false
  "targetLossPercent": 5.25
}
```

**Verification**: ✅ Strategies continue running, trades not blocked

---

### Scenario B: Kill (Blocking)
**Setup**: Set kill switch to 7%, trigger at -7.7%

**Expected**:
```
POST /api/test/simulate-loss
{ "scenario": "kill" }

Response:
{
  "killSwitchResult": { "type": "kill", "triggered": true },
  "tradingSuspended": true,  // ← Now true
  "targetLossPercent": 7.7
}
```

**Verification**: ✅ Strategies skipped, trades rejected with reason

---

### Scenario C: Blocked While Suspended
**Setup**: Trading already suspended

**Expected**:
```
POST /api/test/attempt-trade

Response:
{
  "tradingSuspended": true,
  "riskCheckApproved": false,
  "riskCheckReason": "🚨 Trading suspended due to Kill Switch activation. Reset required before resuming trades."
}
```

**Verification**: ✅ Risk gate blocks execution

---

### Scenario D: Resume Trading
**Setup**: Kill switch triggered, user resets

**Expected**:
```
POST /api/kill-switch/reset

Response:
{
  "success": true,
  "tradingSuspended": false
}

Then:
POST /api/test/attempt-trade

Response:
{
  "tradingSuspended": false,
  "riskCheckApproved": true,  // ← Now approved (if other checks pass)
}
```

**Verification**: ✅ Trading resumes after manual reset

---

## Conclusion

✅ **All verification criteria met**:

1. Strategies pull settings from database (not hardcoded)
2. Signals only produced for screener-eligible pairs
3. Guardrails function as before with kill switch as Check 0
4. Warning threshold is non-blocking (alert only)
5. Kill threshold blocks all trading until manual reset
6. Test endpoints successfully simulate all scenarios

**Kill switch integration is backward-compatible and does not disrupt existing trading logic.**
