# CWQI & NGC Implementation Report
## Detailed History of Signal Quality Metrics and Normalization Attempts

**Document Created:** December 28, 2025  
**Purpose:** Document the complete implementation history of CWQI (Confidence-Weighted Quality Index) and NGC (Normalized Global Confidence), including all subsequent normalization attempts to address high-value clustering issues.

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Original Implementation](#original-implementation)
3. [Problem Identification](#problem-identification)
4. [Normalization Attempts](#normalization-attempts)
5. [Current State](#current-state)
6. [Technical Details](#technical-details)
7. [Recommendations](#recommendations)

---

## Executive Summary

The CWQI and NGC metrics were designed to provide a comprehensive signal quality assessment for trading signals. Initially, the system produced a healthy distribution of values ranging from below 30% to above 90%. Over time, the metrics began clustering in the 60%+ range, reducing differentiation between signal quality levels.

Multiple normalization attempts have been made to restore variance, with limited success. This report documents each approach and its outcomes.

---

## Original Implementation

### Phase 1: Initial CWQI Design (Phase 8.8.4-B.1)

The original CWQI formula combined four weighted components:

```
CWQI = (NGC × 0.40) + ((1 - Risk) × 0.25) + (ExpectedReturn × 0.20) + (ProfitRate × 0.15)
```

**Component Weights:**
| Component | Weight | Description |
|-----------|--------|-------------|
| NGC | 40% | Normalized Global Confidence |
| Risk | 25% | Inverted risk score (lower risk = higher contribution) |
| Expected Return | 20% | Potential profit from entry to target |
| Profit Rate | 15% | Return per unit time |

### Phase 1: Original NGC Formula

The original NGC formula was:

```
NGC = normalize(base_confidence × (1 - volatility) × (1 - risk))
```

This was a **multiplicative** approach where:
- Higher volatility reduced NGC
- Higher risk reduced NGC
- The product was then normalized to 0-1

### Original SQE Thresholds

The Signal Quality Evaluator (SQE) used these thresholds:
- NGC >= 0.45 (originally)
- Risk <= 0.85
- ProfitRate >= 0.10
- CWQI >= 0.35

**Expected Outcome:** ~35-50% pass rate with good distribution from 0.30 to 0.90

---

## Problem Identification

### Issue: High-Value Clustering

Over time, the system began producing metrics that clustered at high values:
- Most NGC values: 0.65-0.85
- Most CWQI values: 0.60-0.80
- Very few signals below 0.50
- Minimal differentiation between "good" and "mediocre" signals

### Root Causes Identified

1. **Rolling Normalization Feedback Loop**: The adaptive rolling normalizer was adjusting its min/max bounds based on incoming samples, causing compression toward the center.

2. **Additive Formula Bias**: Switching from multiplicative to additive blending reduced the penalty for poor metrics.

3. **Floor Values**: Minimum floors on ProfitRate (0.15) and Expected Return (0.30) pushed baseline values higher.

4. **Decay Order Issue**: Normalization was applied before decay, preserving high normalized values even for stale signals.

5. **Conditional Normalization Bypass**: Values already in [0,1] range were passed through without rescaling.

---

## Normalization Attempts

### Attempt 1: Fixed Normalization Parameters (Phase B.2)

**File:** `config/metrics.json`

**Change:** Introduced configurable normalization bounds loaded from external config:

```json
{
  "NGC_MIN": 0.15,
  "NGC_MAX": 0.70,
  "PROFITRATE_MIN": 0.002,
  "PROFITRATE_MAX": 0.80
}
```

**Rationale:** Fixed bounds would prevent the rolling normalizer from drifting.

**Result:** Limited improvement; raw values still clustered high before normalization.

---

### Attempt 2: Adaptive Rolling Normalization (Phase C)

**File:** `server/core/metrics/quality_index.ts`

**Change:** Implemented `RollingNormalizer` class with:
- 500-sample window
- 60-minute time window
- Exponential smoothing (α = 0.15)

```typescript
class RollingNormalizer {
  private smoothedMin: number;
  private smoothedMax: number;
  
  normalize(value: number): number {
    if (value >= 0 && value <= 1) return value; // Bypass
    return (value - min) / (max - min);
  }
}
```

**Rationale:** Dynamically adjust normalization bounds based on actual observed values.

**Result:** Created a feedback loop where normalization bounds converged, reducing variance over time.

---

### Attempt 3: Conditional Normalization (Directive A3.R8.3)

**File:** `server/core/metrics/quality_index.ts` (lines 104-108)

**Change:** Skip normalization if value already in [0,1]:

```typescript
normalize(value: number): number {
  // A3.R8.3: If already in [0,1] range, return as-is
  if (value >= 0 && value <= 1) {
    return value;
  }
  // ...normalize logic
}
```

**Rationale:** Prevent double-normalization of pre-bounded metrics.

**Result:** Preserved raw values, but those raw values were already high due to formula structure.

---

### Attempt 4: Decay-Before-Normalization (Directive A3.R9.2-A)

**File:** `server/core/metrics/signal_metrics_calculator.ts`

**Change:** Reversed the order of decay and normalization:

```
OLD: normalize(rawValue) → applyDecay(normalizedValue)
NEW: applyDecay(rawValue) → normalize(decayedValue)
```

```typescript
export function calculateDecayedMetric(rawValue: number, ageMinutes: number): {
  // Step 1: Apply decay to raw value FIRST (R9.2-A)
  const decayed = applyDecay(rawValue, ageMinutes);
  
  // Step 2: THEN normalize the decayed value
  const normalized = normalize(Math.max(CWQI_FLOOR, decayed), 0, 1);
  
  return { decayed, normalized };
}
```

**Decay Formula:**
```
CWQI_decayed = CWQI_orig × e^(-λt)
```
Where λ = 0.03 per minute (configurable via `CWQI_DECAY_RATE` env var)

**Rationale:** Applying decay first would push older signals' raw values lower before normalization, maintaining variance.

**Result:** Improved signal aging, but new signals still started high.

---

### Attempt 5: NGC Formula Restructure (Directive A3.R9.0)

**File:** `server/core/metrics/quality_index.ts` (lines 268-291)

**Change:** Changed NGC from multiplicative to additive blending:

```typescript
// OLD (multiplicative):
// NGC = normalize(conf × (1 - vol) × (1 - risk))

// NEW (additive - A3.R9.0):
const rawNGC = (conf * 0.5) + ((1 - vol) * 0.3) + ((1 - risk) * 0.2);
```

**Rationale:** Additive blending provides more predictable output ranges.

**Expected Range:** 0.40-0.75 for ~35-50% SQE pass rate

**Result:** More stable output but reduced penalty for poor individual metrics.

---

### Attempt 6: Profitability-Informed NGC (Directive A3.R9.0.A / Extended Metrics)

**File:** `server/core/metrics/quality_index.ts` (lines 672-687)

**Change:** Added profitability influence to NGC calculation:

```typescript
// A3.R9.0.A: Pre-blend normalization
const nBase = clamp01(baseNGC);
const nProfit = clamp01(profitRate);
const nRisk = clamp01(1 - riskScore);

// Additive blending with pre-normalized components
const profitabilityInformedNGC = (nBase * 0.4) + (nProfit * 0.4) + (nRisk * 0.2);
```

**Rationale:** Incorporate profitability signal into NGC for better trade selection.

**Result:** NGC became more correlated with profitRate, reducing independence between metrics.

---

### Attempt 7: Profit Rate Floors (Directive A3.R8.3)

**File:** `server/core/metrics/quality_index.ts` (line 370)

**Change:** Added minimum floor to prevent zero profit rate:

```typescript
const flooredRate = Math.max(normalizedRate, 0.15);
```

**Rationale:** Prevent VWAP and other signals with small target-entry spreads from receiving zero scores.

**Result:** Improved VWAP acceptance but raised baseline for all signals.

---

### Attempt 8: Strategy-Specific Profit Rate Floors (Phase C)

**File:** `server/core/filters/signal_quality_evaluator.ts` (lines 34-40)

**Change:** Different floor thresholds per strategy:

```typescript
const DEFAULT_PROFIT_RATE_FLOORS: Record<string, number> = {
  DHMA: 0.22,
  VWAP_Bounce: 0.25,
  MeanReversion: 0.28,
  Breakout: 0.30,
  Scalper: 0.35,
};
```

**Config File:** `config/strategy_thresholds.json`

**Rationale:** Different strategies have different profitability expectations.

**Result:** Better strategy-specific filtering but didn't address root clustering issue.

---

### Attempt 9: SQE Threshold Adjustment (Directive A3.R9.0)

**File:** `server/core/metrics/quality_index.ts` (lines 743-748)

**Change:** Made SQE thresholds configurable via environment variables:

```typescript
export const SQE_THRESHOLDS = {
  MIN_NGC: parseFloat(process.env.SQE_NGC_MIN || '0.55'),
  MAX_RISK: parseFloat(process.env.SQE_MAX_RISK || '0.85'),
  MIN_PROFIT_RATE: parseFloat(process.env.SQE_PROFIT_MIN || '0.10'),
  MIN_CWQI: parseFloat(process.env.SQE_CWQI_MIN || '0.45'),
};
```

**Rationale:** Allow tuning thresholds without code changes.

**Result:** Helps filtering but doesn't fix underlying value distribution.

---

## Current State

### Current Formulas

**NGC Calculation (Extended Metrics):**
```
Step 1: baseNGC = (confidence × 0.5) + ((1 - volatility) × 0.3) + ((1 - risk) × 0.2)
Step 2: profitabilityInformedNGC = (baseNGC × 0.4) + (profitRate × 0.4) + ((1 - risk) × 0.2)
Final: NGC = clamp01(profitabilityInformedNGC)
```

**CWQI Calculation:**
```
CWQI = (NGC × 0.40) + ((1 - Risk) × 0.25) + (ExpectedReturn × 0.20) + (ProfitRate × 0.15)
```

**Decay Application:**
```
CWQI_decayed = CWQI_original × e^(-0.03 × ageMinutes)
Floor: max(decayed, 0.05)
```

### Current Thresholds

| Metric | Threshold | Configurable Via |
|--------|-----------|------------------|
| MIN_NGC | 0.55 | `SQE_NGC_MIN` env var |
| MAX_RISK | 0.85 | `SQE_MAX_RISK` env var |
| MIN_PROFIT_RATE | 0.10 | `SQE_PROFIT_MIN` env var |
| MIN_CWQI | 0.45 | `SQE_CWQI_MIN` env var |

### Current Configuration Files

- `config/metrics.json` - Normalization bounds
- `config/strategy_thresholds.json` - Per-strategy profit floors

---

## Technical Details

### Key Files and Their Roles

| File | Purpose |
|------|---------|
| `server/core/metrics/quality_index.ts` | Core CWQI/NGC calculation, rolling normalizer |
| `server/core/metrics/signal_metrics_calculator.ts` | Decay-before-normalize logic |
| `server/core/filters/signal_quality_evaluator.ts` | SQE threshold filtering |
| `server/core/rtb/ready_to_buy_service.ts` | Signal queue with decay application |
| `server/services/signal-orchestrator.ts` | Signal generation and metric computation |

### Formula Parameter Summary

| Parameter | Value | Location |
|-----------|-------|----------|
| NGC_WEIGHT | 0.40 | quality_index.ts |
| RISK_WEIGHT | 0.25 | quality_index.ts |
| RETURN_WEIGHT | 0.20 | quality_index.ts |
| PROFIT_RATE_WEIGHT | 0.15 | quality_index.ts |
| CWQI_DECAY_LAMBDA | 0.03/min | Env: CWQI_DECAY_RATE |
| CWQI_FLOOR | 0.05 | ready_to_buy_service.ts |
| PROFIT_RATE_FLOOR | 0.15 | quality_index.ts |
| SMOOTHING_ALPHA | 0.15 | quality_index.ts |
| ROLLING_WINDOW_SIZE | 500 | quality_index.ts |
| ROLLING_WINDOW_MINUTES | 60 | quality_index.ts |

---

## Recommendations

### Potential Solutions Not Yet Implemented

1. **Reduce Additive Blending Weights**: Lower the base contribution weights so poor metrics have more impact.

2. **Remove/Reduce Floors**: The 0.15 profit rate floor and 0.30 expected return floor artificially elevate baselines.

3. **Increase Volatility/Risk Penalties**: Current additive formula doesn't penalize poor conditions enough.

4. **Return to Multiplicative NGC**: The original `conf × (1-vol) × (1-risk)` naturally produces more variance.

5. **Widen Normalization Bounds**: Current config bounds (NGC_MIN=0.15, NGC_MAX=0.70) may be too narrow.

6. **Disable Rolling Normalization**: Use fixed bounds instead of adaptive bounds to prevent convergence.

7. **Add Explicit Distribution Targets**: Implement z-score normalization targeting specific mean/stddev.

### Environment Variables for Tuning

```bash
# SQE Thresholds (higher = stricter filtering)
SQE_NGC_MIN=0.55
SQE_MAX_RISK=0.85
SQE_PROFIT_MIN=0.10
SQE_CWQI_MIN=0.45

# Decay Rate (higher = faster decay of old signals)
CWQI_DECAY_RATE=0.03
```

---

## Appendix: Directive Reference

| Directive | Description |
|-----------|-------------|
| 8.8.4-B.1 | Original CWQI formula with 4 components |
| 8.8.4-B.2 | Configurable normalization parameters |
| 8.8.4-C | Adaptive rolling normalization |
| A3.R8.2 | Skip decay option for refresh cycles |
| A3.R8.3 | Profit rate floors, conditional normalization |
| A3.R9.0 | NGC formula restructure to additive |
| A3.R9.0.A | Profitability-informed NGC |
| A3.R9.0.C | SQE normalization, CWQI correction |
| A3.R9.2 | Unified SQE evaluation logging |
| A3.R9.2-A | Decay-before-normalize order |
| A3.R9.3 | TTL removed, SQE-governed lifecycle |

---

*End of Report*
