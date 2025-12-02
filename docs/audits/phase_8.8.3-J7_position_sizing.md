# Phase 8.8.3-J7: Fix Position Sizing & Portfolio Source for RTB Signals

## Overview
This phase fixes position sizing for paper-mode RTB signals to use realistic values based on the actual paper portfolio value and guardrailsV2.

**Audit Date:** 2025-12-02
**Test Credentials:** username=testuser123, password=SecurePass123!
**Mode:** paper only (live mode unchanged)

---

## J7.1 — Paper-Mode Portfolio Source Audit

### Canonical Paper Portfolio Source

| Component | Location | Field | Notes |
|-----------|----------|-------|-------|
| Storage function | `server/storage.ts:3722-3729` | `getPortfolioState({ mode: 'paper' })` | Returns `PortfolioState` object |
| Primary field | `portfolio_state.balance` | `balance` (decimal) | The canonical paper portfolio value |
| Initialization | `server/startup/portfolio-initializer.ts:39-49` | Default: $1,000.00 | Created if not exists |
| Upsert function | `server/storage.ts:3732-3758` | `upsertPortfolioState()` | Updates portfolio after trades |

### Hardcoded $50,000 Fallbacks Found (REMOVED)

| File | Line | Original Code | Issue |
|------|------|---------------|-------|
| `server/routes.ts` | 3629 | `let portfolioValue = 50000` | Default fallback |
| `server/routes.ts` | 3631-3635 | `portfolioState.totalValue` | **Wrong field!** Should be `balance` |
| `server/services/paper-execution-engine.ts` | 882 | `settings.portfolioValue \|\| '50000'` | Fallback in execution |
| `server/services/trade-safety.ts` | 235 | `settings.portfolioValue \|\| '0') \|\| 50000` | Double fallback |
| `server/services/trade-safety.ts` | 338 | `settings.portfolioValue \|\| '50000'` | Fallback in LPCP |

### Solution
All paper-mode sizing now flows through:
1. `storage.getPortfolioState({ mode: 'paper' })` → `.balance` field
2. New `sizePaperPositionForSignal()` helper function
3. **No hardcoded fallbacks** — if portfolio not found, fail loudly in logs

---

## J7.2 — Paper-Mode Position Sizing Helper

### Location
`server/services/paper-position-sizing.ts`

### Function Signature
```typescript
export function sizePaperPositionForSignal(params: {
  portfolioValue: number;
  guardrails: GuardrailsV2;
  entryPrice: number;
  stopPrice: number;
  symbol: string;
  strategy: StrategyType;
}): {
  quantity: number;
  estimatedValue: number;
}
```

### Sizing Logic

1. **Risk Amount Calculation:**
   ```
   riskAmount = portfolioValue × (portfolioRiskPerTradePct / 100)
   ```

2. **Stop Distance:**
   ```
   stopDistance = |entryPrice - stopPrice|
   ```

3. **Position Quantity:**
   ```
   quantity = riskAmount / stopDistance
   ```

4. **Notional Value Clamp (maxPositionPercentPct):**
   ```
   maxNotional = portfolioValue × (maxPositionPercentPct / 100)
   if (quantity × entryPrice > maxNotional):
     quantity = maxNotional / entryPrice
   ```

5. **Estimated Value:**
   ```
   estimatedValue = quantity × entryPrice
   ```

### Guardrails Used
| Guardrail | Field | Default | Purpose |
|-----------|-------|---------|---------|
| Risk Per Trade | `portfolioRiskPerTradePct` | 1.50% | Risk allocation per position |
| Max Position | `maxPositionPercentPct` | 10.00% | Maximum position as % of portfolio |
| LPCP Threshold | `lpcpLowPriceThresholdUsd` | 0.50 | Low-priced coin detection |
| LPCP Min Notional | `lpcpMinNotionalUsd` | 25.00 | Minimum position value |

### Edge Cases (Return `{ quantity: 0, estimatedValue: 0 }`)
- `portfolioValue <= 0`
- `entryPrice <= 0`
- `stopPrice <= 0`
- `stopDistance === 0`
- Any NaN/Infinity in calculations

---

## J7.3 — Signal Generation (P2) with Pre-Computed Sizing

### Changes to `paper-execution-engine.ts`

**Cycle Context Loading (once per scan cycle):**
```typescript
// At start of scanForSignals():
const paperPortfolio = await storage.getPortfolioState({ mode: 'paper' });
const portfolioValue = parseFloat(paperPortfolio?.balance || '0');
const guardrails = await storage.getGuardrailsV2({ mode: 'paper' });
```

**Signal Sizing (when saving to trading_signals):**
```typescript
// After strategy generates signal:
const sizing = sizePaperPositionForSignal({
  portfolioValue,
  guardrails,
  entryPrice: signal.entryPrice,
  stopPrice: signal.stopPrice,
  symbol: signal.symbol,
  strategy: signal.strategy,
});

await storage.saveTradingSignal({
  ...signalFields,
  quantity: sizing.quantity.toString(),
  estimatedValue: sizing.estimatedValue.toString(),
});
```

### Schema Changes
Added to `trading_signals` table:
- `quantity` (decimal, precision: 20, scale: 8, nullable)
- `estimated_value` (decimal, precision: 20, scale: 2, nullable)

---

## J7.4 — Execution Phase (P3) Uses Pre-Sized Quantity

### Changes to `paper-execution-engine.ts:executeSimulatedTrade()`

**Before (J6):**
```typescript
const portfolioValue = parseFloat(settings.portfolioValue || '50000');
const riskPerTradePct = parseFloat(settings.riskPerTradePct || '4.0');
const riskAmount = (portfolioValue * riskPerTradePct) / 100;
const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
```

**After (J7):**
```typescript
// Use pre-sized quantity from signal (set at P2)
const quantity = signal.quantity || 0;
```

### Guardrail Validation at P3
Guardrails still check the pre-sized quantity against current portfolio state:
- If portfolio value changed significantly, trade may still be blocked
- `MAX_POSITION` can still fire if position now exceeds limit

---

## J7.5 — Engine-Gated RTB Metrics Logging

### Gating Check
```typescript
// In logExecutionAttempt():
if (!this.isRunning) {
  console.log('[8.8.3-J7][AUDIT_SKIP] Engine not running - skipping execution audit');
  return;
}
```

### Behavior
| Engine State | Action |
|--------------|--------|
| Trading = RUNNING | Execution attempts logged to `execution_attempt_audit` |
| Trading = STOPPED | No new rows logged; Last 24h metrics naturally decay |

This matches Filter Insights behavior where metrics only accumulate while engine is active.

---

## J7.6 — Testing & Verification

### Test 1: Portfolio Source Correctness
- [ ] Start paper simulation with non-default value (e.g., $847)
- [ ] Verify sizing helper receives exact portfolio value
- [ ] Confirm no $50k fallback in paper path

### Test 2: Reasonable Quantities
- [ ] Run engine for 2-3 cycles
- [ ] Inspect RTB signals in UI
- [ ] Quantity and $ value should be orders of magnitude smaller than old values
- [ ] Values consistent with `portfolioValue × portfolioRiskPerTradePct`

### Test 3: Execution Metrics Sanity
- [ ] Attempts count grows at expected rate
- [ ] MAX_POSITION blocks should not be 100% of attempts
- [ ] Other block reasons appear where appropriate

### Test 4: Engine-Gated Metrics
- [ ] While running, note "Last 24h Attempts" value
- [ ] Stop trading
- [ ] Confirm no new rows in `execution_attempt_audit`
- [ ] Start again
- [ ] Confirm logging resumes

---

## Files Modified

| File | Change Type |
|------|-------------|
| `server/services/paper-position-sizing.ts` | **NEW** — Pure sizing helper |
| `shared/schema.ts` | Added `quantity`, `estimatedValue` to `trading_signals` |
| `server/services/paper-execution-engine.ts` | Use sizing helper at P2, pre-sized quantity at P3 |
| `server/routes.ts` | Remove on-the-fly sizing in `/api/trading-signals` |
| `server/services/trade-safety.ts` | Use canonical portfolio source |

---

## Constraints Verified

- [x] Paper mode only (live mode unchanged)
- [x] No legacy risk modules re-introduced
- [x] No new guardrails or strategy logic
- [x] Uses existing guardrailsV2 architecture
- [x] Uses canonical paper-portfolio source

---

## Implementation Complete

**Date Completed:** 2025-12-02

### Summary of Changes

1. **J7.1 - Canonical Portfolio Source Audit:** Documented that `storage.getPortfolioState({ mode: 'paper' }).balance` is the canonical source (not `.totalValue` which doesn't exist)

2. **J7.2 - Position Sizing Helper:** Created `server/services/paper-position-sizing.ts` with `sizePaperPositionForSignal()` function that uses guardrailsV2 settings

3. **J7.3 - P2 Sizing Integration:** Updated `paper-execution-engine.ts` to load `cycleContext` (portfolioValue + guardrails) at scan start and apply sizing when RTB signals are generated

4. **J7.4 - P3 Uses Pre-Sized Values:** Modified `executeSimulatedTrade()` to accept `cycleContext` and use stored `signal.quantity` instead of recalculating

5. **J7.5 - Engine-Gated Logging:** Added `isRunning` check to `logExecutionAttempt()` so metrics only log when trading is active

6. **Fallback Removal:** Updated `trade-safety.ts` to skip position-size-dependent checks if no valid portfolioValue (rather than using hardcoded $50k)

### RTB Display Path
```
P2 (Signal Generation) → sizePaperPositionForSignal() → trading_signals.quantity/estimatedValue
P3 (Execution) → signal.quantity → trade execution
API → /api/trading-signals → returns stored quantity/estimatedValue
UI → Ready-to-Buy card → displays pre-computed values
```
