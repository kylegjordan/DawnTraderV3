# Artifact 5 — Null / Rejection Diagnostics Plan

**Audit**: Strategy-Family Filter Profiles
**Date**: 2026-03-23
**Status**: Complete

---

## Current Telemetry Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| `quantStrategyNulls` lumps all null reasons | Cannot diagnose WHY strategies fail | High |
| No total strategy evaluations counter | Cannot compute strategy success rate accurately | High |
| `tradesSimulated` misnamed (means signals) | Confusing metric label | Low |
| Rolling 24h aggregation treats cycles equally | Misleading across time gaps | Low |
| Hybrid null tracking not separated | Cannot isolate hybrid-specific issues | Medium |
| No per-family-path metrics | Cannot diagnose family filter behavior after implementation | High (post-impl) |

---

## Null Reason Taxonomy (Proposed)

### Strategy Null Categories
| Reason Code | Description | Current Tracking | Needed |
|-------------|-------------|------------------|--------|
| `STRATEGY_CONDITIONS_NOT_MET` | Strategy detect() returned null | Counter only | Per-strategy counter |
| `NET_EV_BELOW_FLOOR` | Net EV < VTS minimum | logSkippedSignal ✓ | Add to dashboard counter |
| `ADX_GUARD` | ADX < 25 (sma_trend_ride) | logSkippedSignal ✓ | Add to dashboard counter |
| `DUPLICATE_POSITION_MAX` | Already have pair+strategy combo | logSkippedSignal ✓ | Already visible |
| `MAX_OPEN_TRADES` | Portfolio full | Console log only | Add to logSkippedSignal |
| `REGIME_NO_STRATEGIES` | No strategies enabled for regime | Console log only | Add counter |
| `VN_VETO` | Extreme noise rejection | Console log only | Add counter |
| `PATTERN_NO_DETECTION` | No BUY patterns detected | Counter ✓ | Already tracked |
| `PATTERN_UNKNOWN_CANONICAL` | Pattern not in canonical map | Silently skipped | Add counter |

### Rejection Reason Taxonomy (SQE + RTB)
| Reason Code | Source | Current Tracking |
|-------------|--------|------------------|
| `LOW_FINAL_SCORE` | SQE | logSkippedSignal ✓ |
| `LOW_REGIME_WEIGHT` | SQE | logSkippedSignal ✓ |
| `LOW_ROI` | SQE | logSkippedSignal ✓ |
| `CONFIDENCE_FLOOR` | SQE | logSkippedSignal ✓ |
| `GOVERNANCE_BLOCK` | SQE | logSkippedSignal ✓ |
| `PAIR_LEVEL_GUARD` | RTB | Console log only |
| `SIGNAL_EXPIRED` | RTB | SLAL event ✓ |
| `REFRESH_FAILED` | RTB | SLAL event ✓ |

---

## Recommended Telemetry Additions

### 1. Expand VTSEvalSnapshot with Null Reason Breakdown

```typescript
interface VTSEvalSnapshot {
  // EXISTING
  quantPairsEvaluated: number;
  patternPairsEvaluated: number;
  quantStrategyNulls: number;
  patternNoDetection: number;
  patternDetected: number;
  signalsGenerated: number;
  byStrategy: Record<string, { evaluated: number; nulls: number; signals: number }>;

  // NEW — Null Reason Breakdown
  nullReasons: {
    conditionsNotMet: number;      // Strategy returned null (no specific reason)
    netEvBelowFloor: number;       // Net EV < VTS floor
    adxGuard: number;              // ADX < 25 guard
    duplicatePosition: number;      // Already have pair+strategy
    maxOpenTrades: number;          // Portfolio full
    regimeNoStrategies: number;     // No strategies for regime
    vnVeto: number;                 // Extreme noise rejection
    unknownCanonical: number;       // Pattern not in canonical map
  };

  // NEW — Total Strategy Evaluations
  totalStrategyEvaluations: number;  // Sum of all detect() calls across all pairs and paths

  // NEW — Per-Family-Path Metrics (post-implementation)
  byFamilyPath?: Record<string, {
    pairsEvaluated: number;
    strategiesAttempted: number;
    nulls: number;
    signals: number;
  }>;
}
```

### 2. Add Quant/Pattern/Hybrid Split to Dashboard

Current ML page shows:
- Pairs Evaluated: Quant | Pattern | Total

Should also show:
- Strategy Evaluations: Quant | Pattern | Hybrid | Total
- Null Reasons: breakdown table by reason code
- Signal Success Rate: signals / strategy evaluations (not signals / pairs)

### 3. Before/After Comparison Method

To validate family-aware filtering implementation:

**Capture BEFORE metrics** (run for 24h before implementation):
- Per-path survivor counts (quant global, pattern global, quant IMF, pattern IMF)
- Per-strategy evaluation counts and null rates
- Signal generation rate by strategy
- Rejection reason distribution

**Capture AFTER metrics** (run for 24h after implementation):
- Per-family-path survivor counts (trend, reversal, breakout, oscillator, pattern)
- Per-family strategy evaluation counts and null rates
- Signal generation rate by strategy (should increase for reversal/oscillator)
- Rejection reason distribution (should shift away from conditionsNotMet)

**Success criteria**:
- Reversal/oscillator strategies should show **increased** evaluations
- Overall null rate should **decrease** (fewer mismatched pair-strategy evaluations)
- Signal quality (FinalScore distribution) should remain stable or improve
- No new dead paths (every family path should produce at least some survivors)
- Total signal count may increase but quality must not decrease

---

## Implementation Priority

| Item | Priority | Effort | When |
|------|----------|--------|------|
| Add null reason breakdown to VTSEvalSnapshot | High | Low | Pre-family-filter implementation |
| Add totalStrategyEvaluations counter | High | Low | Pre-family-filter implementation |
| Rename tradesSimulated → signalsGenerated | Low | Trivial | Any time |
| Add per-family-path metrics | High | Medium | With family-filter implementation |
| Capture before-metrics baseline | High | Low | Immediately before implementation |
| Dashboard null reason table | Medium | Medium | With or after family-filter implementation |
