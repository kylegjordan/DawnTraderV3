# Directive 11.4C.2 — Implementation Summary

**Date**: 2026-01-10  
**Status**: Audit Complete

---

## 1. Audit Statistics

| Metric                      | Value |
|-----------------------------|-------|
| Total files scanned         | 525   |
| Files with mapping defs     | 6     |
| Total pattern occurrences   | 10    |
| Potential conflicts         | 4     |
| Conflicting files           | 2     |

---

## 2. Locations of Mismatched or Duplicated Definitions

### Conflicting Files

| File                                          | Conflict Type                                |
|-----------------------------------------------|----------------------------------------------|
| `server/core/schema/trade-model.ts`           | Defines SignalType and MarketRegimeType      |
| `server/types/virtual-trade.interface.ts`     | Defines SignalType and MarketRegimeType      |

### Details

1. **SignalType** is defined in 3 locations:
   - `server/types.ts` (canonical) — `'QUANT' | 'PATTERN' | 'HYBRID'`
   - `server/core/schema/trade-model.ts` (duplicate)
   - `server/types/virtual-trade.interface.ts` (duplicate)

2. **MarketRegimeType** is defined in 3 locations:
   - `server/types/market-regime.types.ts` (canonical)
   - `server/core/schema/trade-model.ts` (duplicate)
   - `server/types/virtual-trade.interface.ts` (duplicate)

---

## 3. Complete Legacy-to-Current Strategy Name Map

### Signal Orchestrator Strategies (Legacy/Production)

| ID               | Display Name     | Engine Method           |
|------------------|------------------|-------------------------|
| vwap_pullback    | VWAP Pullback    | detectVWAPPullback      |
| abcd_long        | ABCD Long        | detectABCDLong          |
| sma_trend_ride   | SMA Trend Ride   | detectSMATrendRide      |
| breakout         | Breakout         | detectBreakout          |
| mean_reversion   | Mean Reversion   | detectMeanReversion     |
| range_trading    | Range Trading    | detectRangeTrading      |
| vwap_bounce      | VWAP Bounce      | detectVWAPBounce        |
| liquidity_trap   | Liquidity Trap   | detectLiquidityTrap     |
| dhma             | DHMA             | detectDHMA              |

### VTS/Regime-Strategy-Map Strategies (Current)

| Signal Type   | Regime           | Current Strategies                                    |
|---------------|------------------|-------------------------------------------------------|
| Hybrid        | BULL_STABLE      | MomentumPulse, TrendFlow, BreakoutConfirm             |
| Hybrid        | BEAR_VOLATILE    | BreakdownSniper, ReverseImpulse, DefensiveHedge       |
| Pattern       | LOW_VOL_CHOP     | RangeTrade, SupportBounce, TriangleBreakout, DoubleBottom |
| Quantitative  | HIGH_VOL_IMPULSE | H2_Slingshot, ImpulseChaser, VolatilityEdge           |
| Hybrid        | TRANSITION       | MeanReversion, PivotShift, AdaptiveFlow               |

### Proposed Normalization Map

```json
{
  "MomentumPulse": { "legacyId": "vwap_pullback", "displayName": "VWAP Pullback" },
  "TrendFlow": { "legacyId": "sma_trend_ride", "displayName": "SMA Trend Ride" },
  "BreakoutConfirm": { "legacyId": "breakout", "displayName": "Breakout" },
  "H2_Slingshot": { "legacyId": "vwap_bounce", "displayName": "VWAP Bounce" },
  "ImpulseChaser": { "legacyId": "liquidity_trap", "displayName": "Liquidity Trap" },
  "MeanReversion": { "legacyId": "mean_reversion", "displayName": "Mean Reversion" },
  "RangeTrade": { "legacyId": "range_trading", "displayName": "Range Trading" },
  "TriangleBreakout": { "legacyId": "abcd_long", "displayName": "ABCD Long" },
  "VolatilityEdge": { "legacyId": null, "displayName": "Volatility Edge (new)" },
  "SupportBounce": { "legacyId": null, "displayName": "Support Bounce (new)" },
  "DoubleBottom": { "legacyId": null, "displayName": "Double Bottom (new)" },
  "BreakdownSniper": { "legacyId": null, "displayName": "Breakdown Sniper (new)" },
  "ReverseImpulse": { "legacyId": null, "displayName": "Reverse Impulse (new)" },
  "DefensiveHedge": { "legacyId": null, "displayName": "Defensive Hedge (new)" },
  "PivotShift": { "legacyId": null, "displayName": "Pivot Shift (new)" },
  "AdaptiveFlow": { "legacyId": null, "displayName": "Adaptive Flow (new)" }
}
```

---

## 4. VTS Runner vs Signal Orchestrator Regime Logic Comparison

### Regime Calculation

| Aspect              | VTS Runner                           | Signal Orchestrator         |
|---------------------|--------------------------------------|-----------------------------|
| Source              | `market-regime.ts:calculatePairRegime()` | Uses StrategyEngine directly |
| Regime Types Used   | BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, TRANSITION | Not explicitly used |
| Strategy Selection  | Via regimeStrategyMap               | Via enabledStrategies set   |

### Key Differences

1. **VTS Runner** uses `calculatePairRegime()` to determine market regime per pair, then maps to strategies via `regimeStrategyMap`.

2. **Signal Orchestrator** does NOT use regime-based strategy selection. It uses a fixed `enabledStrategies` set and runs all enabled strategies on all pairs.

3. **Regime logic is NOT identical** between VTS and Orchestrator:
   - VTS: Regime → Strategy mapping
   - Orchestrator: All strategies run regardless of regime

### Verdict: ❌ NOT IDENTICAL

The VTS Runner and Signal Orchestrator use fundamentally different approaches:
- VTS uses regime-aware strategy selection
- Orchestrator uses fixed strategy sets

---

## 5. Pattern Type Status

### Canonical Patterns (5 total)

All defined in `server/types.ts`:

| Pattern        | Detection Function  | Status |
|----------------|---------------------|--------|
| PINBAR         | detectPinbar()      | ✅ Implemented |
| ENGULFING      | detectEngulfing()   | ✅ Implemented |
| INSIDE_BAR     | detectInsideBar()   | ✅ Implemented |
| THREE_SOLDIERS | detectThreeSoldiers() | ✅ Implemented |
| MORNING_STAR   | detectMorningStar() | ✅ Implemented |

### Pattern Population Status

- **VTS Runner**: Does NOT call pattern-recognizer.ts (patterns not populated in VTS)
- **Signal Orchestrator**: Calls pattern-recognizer via hybrid-integration.ts
- **Top Batch Table**: Expects `pattern` field but receives empty/undefined from VTS

---

## 6. Audit Deliverables

| Deliverable                           | File                                              | Status |
|---------------------------------------|---------------------------------------------------|--------|
| Mapping Inventory JSON                | `audit/reports/strategy_regime_mapping_audit.json` | ✅ Complete |
| Cross-Module Linkage Diagram          | `audit/reports/mapping_linkage.md`                | ✅ Complete |
| Regime Metric Verification            | `audit/reports/regime_metric_verification.md`     | ✅ Complete |
| Audit Validation Script               | `scripts/test-regime-mapping-audit.ts`            | ✅ Complete |
| Scan Results JSON                     | `audit/reports/audit_scan_results.json`           | ✅ Complete |
| Implementation Summary                | `audit/reports/implementation_summary.md`         | ✅ Complete |

---

## 7. Recommended Next Steps (Directive 11.4C.3)

1. **Unify Type Definitions**: Remove duplicate SignalType and MarketRegimeType from:
   - `server/core/schema/trade-model.ts`
   - `server/types/virtual-trade.interface.ts`
   
2. **Synchronize Strategy Names**: Create a unified strategy mapping that bridges:
   - Legacy IDs (vwap_pullback, breakout, etc.)
   - Display names (VWAP Pullback, Breakout, etc.)
   - VTS strategy names (MomentumPulse, BreakoutConfirm, etc.)

3. **Add Pattern Population to VTS**: Call pattern-recognizer.ts in VTS runner to populate pattern field.

4. **Align Regime Handling**: Add missing regime handlers in:
   - `telemetry-aggregator.ts:inferStrategy()` (missing HIGH_VOL_IMPULSE, TRANSITION)
   - `top-batch.tsx:getRegimeBadgeClass()` (missing HIGH_VOL_IMPULSE, TRANSITION)

5. **Remove Non-Canonical Regimes**: Either add to canonical types or remove:
   - BULL_VOLATILE
   - BEAR_STABLE
   - EXTREME_NOISE

---

## 8. Conclusion

The audit is complete. We now have a definitive picture of all mapping dependencies across the system. The primary issues identified are:

1. **Strategy name divergence** between VTS/regime-map and Signal Orchestrator
2. **Duplicate type definitions** in 2 files
3. **Regime handling gaps** in telemetry aggregator and UI
4. **Pattern population missing** in VTS pipeline

These issues can now be safely addressed in Directive 11.4C.3 (Mapping Synchronization & Renaming).
