# Directive 11.7O: Learning Observability & Truthfulness UI

**Date**: 2026-01-28
**Status**: COMPLETE (Architect PASS)

## Overview

This directive implements UI truthfulness improvements identified in Directive 11.7N, ensuring users see accurate representations of learning system activity.

## Implementation Summary

### Phase A: Predictive Adjustments Filtering
**File**: `client/src/pages/machine-learning.tsx`

- Filters adjustments to show only entries where:
  - `impact !== null` (has measurable effect)
  - `category` is "Weight" or "Risk" (excludes "Other", "Scoring", lifecycle events)
- Adds hidden event counter: "(X lifecycle events hidden)"
- Result: 74% of adjustments were lifecycle noise, now hidden

### Phase B: Scoring Events Suppression
**File**: `client/src/pages/machine-learning.tsx`

- Scoring/lifecycle events (category: "Scoring", "Other") are excluded from the main adjustments list
- These events remain in logs for audit purposes but don't clutter the UI

### Phase C: Decision Traceback Passive Mode Handling
**File**: `client/src/pages/analytics.tsx`

- Detects passive learning mode via `useTradingMode().isPaper`
- Shows explanatory message: "Decision Traceback is unavailable in Passive Learning mode. VTS decisions are recorded but not yet wired for trace visualization."
- Displays "Passive Mode" badge in card header
- Provides guidance: "Switch to Live mode to enable real-time decision tracing."

### Phase D: Global Friction Null Handling
**File**: `client/src/pages/analytics.tsx`

- Handles null/undefined friction score with "Insufficient Data" placeholder
- Shows explanatory tooltip: "Friction score unavailable. Market friction data may be initializing or temporarily unavailable. This typically resolves within a few seconds after data refresh."
- Fixed tooltip positioning with `z-50` and `side="bottom"`

### Phase E: Learning System Status Section
**File**: `client/src/pages/analytics.tsx`

Added new "Learning System Status" card showing:

| System | Status | Tooltip |
|--------|--------|---------|
| ML Calibration | Active (Learning) | - |
| Telemetry Aggregator | Active (Learning) | - |
| Heuristic Trader | Inactive — By Design | Behavioral adaptation, not trade outcomes |
| Signal Weight Optimizer | Inactive — By Design | Requires live prediction tracking |
| Cognitive Weight Adjuster | Inactive — By Design | Requires user-curated sources |
| Adaptive Guardrails | Inactive — By Design | Learns from UI actions |
| QUANT Strategy Calibration | Future (Not Implemented) | Planned for QUANT-specific learning |

## Verification

### API Tests
```bash
# Predictive Adjustments: 10 Weight, 2 Scoring (hidden), 8 Other (hidden)
curl /api/vts/predictive-adjustments?limit=20

# Global Friction: Available with sample size
curl /api/market-indicators
# Response: globalFrictionScore: 11, frictionSampleSize: 7
```

### Server Logs
- ML Calibration active: 5 weight adjustments generated
- Adjustments correctly categorized with impact values

## Files Changed
- `client/src/pages/machine-learning.tsx`: Filtering logic
- `client/src/pages/analytics.tsx`: Decision Traceback suppression, Friction handling, Learning System Status

## Related Directives
- **11.7N**: Analysis that identified these truthfulness gaps
- **11.7M**: ML Calibration case sensitivity fix that enabled active learning
