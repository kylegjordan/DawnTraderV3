# Directive 11.4C.2 — Regime Metric Verification

## Regime Classification Source

**File**: `server/core/metrics/market-regime.ts`  
**Function**: `calculatePairRegime(ohlcData: OHLCData[])`

## Metrics Used

| Metric       | Function               | Calculation                                              |
|--------------|------------------------|----------------------------------------------------------|
| **Volatility** | `computeVolatility()` | Standard deviation of price returns                      |
| **Momentum**   | `computeMomentum()`   | 14-period price change: `(endPrice - startPrice) / startPrice` |
| **ADX**        | `computeADX()`        | Average Directional Index (14-period)                    |

## Regime Classification Thresholds

### 1. LOW_VOL_CHOP ✅
```typescript
if (vol < 0.015 && Math.abs(mom) < 0.002) {
  regime = 'LOW_VOL_CHOP';
  confidence = 0.75 + (0.015 - vol) * 10;
}
```
**Conditions:**
- Volatility < 1.5%
- |Momentum| < 0.2%

### 2. BULL_STABLE ✅
```typescript
else if (mom > 0.002 && adx > 25) {
  regime = 'BULL_STABLE';
  confidence = 0.70 + Math.min(mom * 10, 0.2) + (adx - 25) * 0.005;
}
```
**Conditions:**
- Momentum > 0.2%
- ADX > 25

### 3. BEAR_VOLATILE ✅
```typescript
else if (mom < -0.002 && adx > 25) {
  regime = 'BEAR_VOLATILE';
  confidence = 0.65 + Math.min(Math.abs(mom) * 8, 0.2);
}
```
**Conditions:**
- Momentum < -0.2%
- ADX > 25

### 4. HIGH_VOL_IMPULSE ✅
```typescript
else if (vol > 0.025) {
  regime = 'HIGH_VOL_IMPULSE';
  confidence = 0.60 + (vol - 0.025) * 8;
}
```
**Conditions:**
- Volatility > 2.5%

### 5. TRANSITION ✅ (Default)
```typescript
else {
  regime = 'TRANSITION';
  confidence = 0.50;
}
```
**Conditions:**
- None of the above conditions met

## Regime Weights

**File**: `server/types/market-regime.types.ts`

| Regime           | Weight | Description                                                    |
|------------------|--------|----------------------------------------------------------------|
| BULL_STABLE      | 0.85   | Persistent uptrend with controlled volatility                  |
| HIGH_VOL_IMPULSE | 0.70   | High volatility with impulsive moves                           |
| LOW_VOL_CHOP     | 0.55   | Sideways range-bound market                                    |
| TRANSITION       | 0.50   | Market regime shifting                                         |
| BEAR_VOLATILE    | 0.40   | Downtrend with high volatility                                 |

## Verification Status

### ✅ All 5 Canonical Regimes Exist
- BULL_STABLE
- BEAR_VOLATILE
- LOW_VOL_CHOP
- HIGH_VOL_IMPULSE
- TRANSITION

### ⚠️ Non-Canonical Regimes in Other Modules

The following regimes are referenced but **NOT defined** in the canonical `market-regime.types.ts`:

| Regime         | Found In                          | Status        |
|----------------|-----------------------------------|---------------|
| BULL_VOLATILE  | telemetry-aggregator.ts:802-803   | ⚠️ Not canonical |
| BEAR_STABLE    | telemetry-aggregator.ts:804       | ⚠️ Not canonical |
| EXTREME_NOISE  | telemetry-aggregator.ts:806-807   | ⚠️ Not canonical |

### ⚠️ UI Handles Non-Canonical Regimes

**File**: `client/src/components/trading/top-batch.tsx`

```typescript
function getRegimeBadgeClass(regime: string): string {
  switch (regime) {
    case 'BULL_STABLE':       // ✅ Canonical
    case 'BULL_VOLATILE':     // ⚠️ Not canonical
    case 'BEAR_STABLE':       // ⚠️ Not canonical
    case 'BEAR_VOLATILE':     // ✅ Canonical
    case 'LOW_VOL_CHOP':      // ✅ Canonical
    case 'EXTREME_NOISE':     // ⚠️ Not canonical
    default:                  // Falls through for TRANSITION, HIGH_VOL_IMPULSE
  }
}
```

## Duplicate/Conflicting Definitions

### ❌ No Duplicates Found

The regime calculation logic exists in one canonical location:
- `server/core/metrics/market-regime.ts`

### ⚠️ Strategy Inference Uses Non-Canonical Regimes

**File**: `server/services/telemetry-aggregator.ts`, function `inferStrategy()`

```typescript
private inferStrategy(entry: PairTelemetry): string {
  const regime = this.currentRegime;
  
  if (regime === 'BULL_STABLE') {
    return entry.hybridScore > 0.5 ? 'TrendFlow' : 'MomentumPulse';
  } else if (regime === 'BULL_VOLATILE') {    // ⚠️ Not canonical
    return 'BreakoutCapture';
  } else if (regime === 'BEAR_STABLE' || regime === 'BEAR_VOLATILE') {  // ⚠️ BEAR_STABLE not canonical
    return 'MeanReversion';
  } else if (regime === 'EXTREME_NOISE') {    // ⚠️ Not canonical
    return 'ExtremeNoisePause';
  }
  return 'AdaptiveFlow';
}
```

## Missing Regime Handling

| Canonical Regime   | Handled in inferStrategy()? | Handled in UI? |
|--------------------|------------------------------|----------------|
| BULL_STABLE        | ✅ Yes                       | ✅ Yes         |
| BEAR_VOLATILE      | ✅ Yes                       | ✅ Yes         |
| LOW_VOL_CHOP       | ❌ Falls to default          | ✅ Yes         |
| HIGH_VOL_IMPULSE   | ❌ Falls to default          | ❌ Falls to default |
| TRANSITION         | ❌ Falls to default          | ❌ Falls to default |

## Recommendations

1. **Standardize Regime Types**: Update `telemetry-aggregator.ts` to only use canonical regimes
2. **Add Missing Handlers**: Add explicit handling for HIGH_VOL_IMPULSE and TRANSITION in:
   - `telemetry-aggregator.ts:inferStrategy()`
   - `top-batch.tsx:getRegimeBadgeClass()`
3. **Remove Non-Canonical References**: Remove BULL_VOLATILE, BEAR_STABLE, EXTREME_NOISE from codebase or add to canonical types
4. **Align VTS and Orchestrator**: Both should use the same regime calculation source
