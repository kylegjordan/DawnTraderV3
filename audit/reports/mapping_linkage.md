# Directive 11.4C.2 — Cross-Module Linkage Diagram

## Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SIGNAL TYPE / REGIME / STRATEGY FLOW                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  market-regime  │
                              │   .types.ts     │
                              │ (Type Defs)     │
                              └────────┬────────┘
                                       │ imports
                                       ▼
┌─────────────────┐            ┌─────────────────┐
│ regime-strategy │            │  market-regime  │
│    -map.ts      │◄───────────│      .ts        │
│ (Strategy Map)  │  imports   │ (Calculation)   │
└────────┬────────┘            └────────┬────────┘
         │                              │
         │ imports                      │ imports
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vts-runner.ts                                   │
│                     (Virtual Trade Simulator)                                │
│                                                                              │
│  Consumes: regimeStrategyMap, calculatePairRegime, getRegimeWeight          │
│  Produces: Virtual trades with regime, signalType, strategy                 │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ writes telemetry (caller: 'vts')
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         telemetry-aggregator.ts                              │
│                     (Telemetry Storage & Ranking)                            │
│                                                                              │
│  Consumes: Pair telemetry data with regime, signalType, strategy            │
│  Functions: inferSignalType(), inferStrategy(), getRankedPairs()            │
│  Produces: Ranked pairs for API consumption                                 │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ API call: /api/pairs/ranked
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        top-batch.tsx (Client)                                │
│                      (Top Batch Table Display)                               │
│                                                                              │
│  Consumes: signalType, strategy, pattern, regime from API                   │
│  Functions: getSignalTypeIcon(), getRegimeBadgeClass()                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Parallel Flow: Signal Orchestrator

```
┌─────────────────┐            ┌─────────────────┐
│   types.ts      │            │ strategy-engine │
│  (SignalType,   │            │      .ts        │
│   PatternType)  │            │ (Detection)     │
└────────┬────────┘            └────────┬────────┘
         │                              │
         │ imports                      │ imports
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         signal-orchestrator.ts                               │
│                        (Live Signal Generation)                              │
│                                                                              │
│  enabledStrategies: vwap_pullback, abcd_long, sma_trend_ride, breakout,     │
│                     mean_reversion, range_trading, vwap_bounce,              │
│                     liquidity_trap, dhma                                     │
│                                                                              │
│  Note: Uses DIFFERENT strategy names than VTS/regime-strategy-map           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ forwards signals
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SQE → RTB → TCL                                 │
│                        (Trade Execution Pipeline)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Pattern Recognition Flow

```
┌─────────────────┐
│   types.ts      │
│  (PatternType)  │
└────────┬────────┘
         │ imports
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        pattern-recognizer.ts                                 │
│                      (Candlestick Detection)                                 │
│                                                                              │
│  Detects: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR       │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ pattern signals
         ▼
┌─────────────────┐            ┌─────────────────┐
│   hybrid-       │            │    vts-runner   │
│ integration.ts  │            │      .ts        │
└─────────────────┘            └─────────────────┘
```

## Field Producer/Consumer Matrix

| Field        | Producer Module           | Consumer Modules                              | Linkage Type    |
|--------------|---------------------------|-----------------------------------------------|-----------------|
| signalType   | vts-runner.ts             | telemetry-aggregator.ts, top-batch.tsx        | Direct import   |
| strategy     | vts-runner.ts (via map)   | telemetry-aggregator.ts, top-batch.tsx        | Direct import   |
| pattern      | pattern-recognizer.ts     | hybrid-integration.ts, vts-runner.ts          | Direct import   |
| regime       | market-regime.ts          | vts-runner.ts, telemetry-aggregator.ts        | Direct import   |

## Critical Mismatches Identified

### 1. Strategy Name Divergence
- **VTS Runner / Regime Map**: MomentumPulse, TrendFlow, BreakoutConfirm, H2_Slingshot, etc.
- **Signal Orchestrator**: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, etc.

### 2. Regime Type Divergence
- **market-regime.types.ts**: BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, TRANSITION
- **telemetry-aggregator.ts inferStrategy()**: Also uses BULL_VOLATILE, BEAR_STABLE, EXTREME_NOISE (not in canonical types)
- **top-batch.tsx**: Also renders BULL_VOLATILE, BEAR_STABLE, EXTREME_NOISE (UI handles but not in canonical)

### 3. SignalType Casing Divergence
- **types.ts**: 'QUANT' | 'PATTERN' | 'HYBRID' (uppercase)
- **regime-strategy-map.ts**: 'Hybrid', 'Pattern', 'Quantitative' (mixed case)
- **telemetry-aggregator.ts**: 'Hybrid', 'Quantitative', 'Pattern' (mixed case)
- **top-batch.tsx**: 'Hybrid', 'Quantitative', 'Pattern' (mixed case)

## Name Normalization Plan

### Current → Legacy Strategy Name Mapping

| Current (regime-strategy-map) | Legacy (signal-orchestrator) | Files Affected |
|-------------------------------|------------------------------|----------------|
| MomentumPulse                 | vwap_pullback                | vts-runner.ts:82, regime-strategy-map.ts:29 |
| TrendFlow                     | sma_trend_ride               | vts-runner.ts:82, regime-strategy-map.ts:29, telemetry-aggregator.ts:801 |
| BreakoutConfirm               | breakout                     | vts-runner.ts:82, regime-strategy-map.ts:29 |
| H2_Slingshot                  | vwap_bounce                  | vts-runner.ts:83, regime-strategy-map.ts:47 |
| ImpulseChaser                 | liquidity_trap               | vts-runner.ts:83, regime-strategy-map.ts:47 |
| VolatilityEdge                | (new - no legacy)            | regime-strategy-map.ts:47 |
| MeanReversion                 | mean_reversion               | vts-runner.ts:83, regime-strategy-map.ts:53, telemetry-aggregator.ts:805 |
| RangeTrade                    | range_trading                | vts-runner.ts:82, regime-strategy-map.ts:41 |
| SupportBounce                 | (new - no legacy)            | vts-runner.ts:82, regime-strategy-map.ts:41 |
| TriangleBreakout              | abcd_long                    | regime-strategy-map.ts:41 |
| DoubleBottom                  | (new - no legacy)            | regime-strategy-map.ts:41 |
| BreakdownSniper               | (new - no legacy)            | regime-strategy-map.ts:35 |
| ReverseImpulse                | (new - no legacy)            | regime-strategy-map.ts:35 |
| DefensiveHedge                | (new - no legacy)            | regime-strategy-map.ts:35 |
| PivotShift                    | (new - no legacy)            | regime-strategy-map.ts:53 |
| AdaptiveFlow                  | (new - no legacy)            | regime-strategy-map.ts:53, telemetry-aggregator.ts:809 |

### Proposed Renaming Map (to restore legacy titles)

```json
{
  "renamings": [
    {
      "current": "MomentumPulse",
      "legacy": "VWAP Pullback",
      "filesAffected": ["vts-runner.ts:82", "regime-strategy-map.ts:29", "telemetry-aggregator.ts:801"]
    },
    {
      "current": "TrendFlow",
      "legacy": "SMA Trend Ride",
      "filesAffected": ["vts-runner.ts:82", "regime-strategy-map.ts:29", "telemetry-aggregator.ts:801"]
    },
    {
      "current": "BreakoutConfirm",
      "legacy": "Breakout",
      "filesAffected": ["vts-runner.ts:82", "regime-strategy-map.ts:29"]
    },
    {
      "current": "H2_Slingshot",
      "legacy": "VWAP Bounce",
      "filesAffected": ["vts-runner.ts:83", "regime-strategy-map.ts:47"]
    },
    {
      "current": "ImpulseChaser",
      "legacy": "Liquidity Trap",
      "filesAffected": ["vts-runner.ts:83", "regime-strategy-map.ts:47"]
    },
    {
      "current": "MeanReversion",
      "legacy": "Mean Reversion",
      "filesAffected": ["vts-runner.ts:83", "regime-strategy-map.ts:53", "telemetry-aggregator.ts:805"]
    },
    {
      "current": "RangeTrade",
      "legacy": "Range Trading",
      "filesAffected": ["vts-runner.ts:82", "regime-strategy-map.ts:41"]
    },
    {
      "current": "TriangleBreakout",
      "legacy": "ABCD Long",
      "filesAffected": ["regime-strategy-map.ts:41"]
    }
  ]
}
```
