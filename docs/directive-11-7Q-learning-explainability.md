# Directive 11.7Q — Learning Explainability, Stability & Adjustment Governance

## Purpose

Now that ML Calibration and Passive Decision Traceback are active and verified, the system has entered its first true learning phase. At this stage, the highest risk is not lack of learning, but opaque, uncontrolled, or misinterpreted learning behavior.

Directive 11.7Q establishes explainability, stability visibility, and governance instrumentation for predictive adjustments **without modifying any learning logic**.

## Scope Constraints (Non-Negotiable)

The following are explicitly prohibited in Directive 11.7Q:

- ❌ No changes to learning formulas
- ❌ No changes to thresholds, scoring, or weight deltas
- ❌ No disabling, pausing, or dampening of ML Calibration
- ❌ No P&L-based intervention logic
- ❌ No regime-specific biasing

**This directive is observability-only.**

---

## Phase A — Predictive Adjustment Explainability Layer

### Schema: `learning-explainability/v1.0`

Every predictive adjustment now includes a structured explanation:

```typescript
interface AdjustmentExplanation {
  triggerContext: {
    learningSystem: string;      // e.g., "ML Calibration Service"
    evaluationWindow: string;    // e.g., "Last 50 trades"
    sampleSize: number;          // Number of trades evaluated
    evaluationPeriod?: string;   // Date of evaluation
  };
  performanceRationale: {
    triggerMetric: string;       // e.g., "expectancy", "win_rate"
    metricValue: number | string;
    direction: 'improved' | 'degraded' | 'stable' | 'unknown';
    regimesInvolved: string[];
    additionalMetrics?: Record<string, number | string>;
  };
  intentSummary: string;         // Human-readable explanation
  confidenceLevel: 'high' | 'medium' | 'low';
  isLifecycleEvent: boolean;
}
```

### Example Intent Summary

> "ENGULFING weight decreased by 0.0500 due to negative expectancy (-0.42R) over last 50 HYBRID trades in LOW_VOL_CHOP."

### API Endpoint

```
GET /api/vts/predictive-adjustments/explained?limit=50
```

Returns adjustments enriched with full explanations.

---

## Phase B — Adjustment Frequency & Stability Visibility

### Schema: `learning-stability/v1.0`

Read-only instrumentation showing adjustment frequency and stability:

```typescript
interface StabilityMetrics {
  adjustmentsPerHour: number;
  adjustmentsPerDay: number;
  burstyPeriods: BurstyPeriod[];
  parameterTouchHistory: ParameterTouchHistory[];
  stabilityScore: number;  // 0-100, higher = more stable
}

interface ParameterTouchHistory {
  parameter: string;
  lastAdjusted: string;
  adjustmentCount24h: number;
  adjustmentCount7d: number;
  consecutiveAdjustments: number;
  totalDelta24h: number;
  direction: 'increasing' | 'decreasing' | 'oscillating' | 'stable';
  withinCooldown: boolean;
  cooldownRemainingMs?: number;
}
```

### API Endpoint

```
GET /api/vts/predictive-adjustments/stability
```

### Stability Score Calculation

- Base score: 100
- Penalty for oscillating parameters: -50% * (oscillating_count / total_params)
- Penalty for bursty periods: -10 per burst

---

## Phase C — Outcome Correlation (Lagged, Read-Only)

Post-adjustment outcome context is provided as part of the telemetry aggregation. This data is:

- Clearly labeled as "lagged and non-causal"
- Purely informational correlation view
- No implication of real-time causality

---

## Phase D — Adjustment Safety Signals (No Automation)

### Visual Flags (Advisory Only)

```typescript
interface SafetySignal {
  type: 'rapid_adjustment' | 'regime_instability' | 'poor_performance' | 'oscillation';
  severity: 'info' | 'warning' | 'alert';
  parameter: string;
  description: string;
  timestamp: string;
  isAdvisoryOnly: true;  // ALWAYS true - no automated behavior
}
```

### Signal Types

1. **rapid_adjustment**: Multiple adjustments to same parameter within short time window
2. **oscillation**: Parameter showing back-and-forth adjustments
3. **regime_instability**: Adjustments during regime transitions (future)
4. **poor_performance**: Adjustments while rolling metrics are below tolerance (future)

### API Endpoint

```
GET /api/vts/predictive-adjustments/safety-signals
```

Response includes explicit disclaimer:
> "These signals are advisory only and do not block or alter learning behavior."

---

## Implementation Files

### Backend Services

- `server/core/learning/adjustment-explainability.ts` - Explanation generation
- `server/core/learning/adjustment-stability.ts` - Stability metrics calculation
- `server/routes/vts-predictive-adjustments.ts` - API endpoints

### Frontend Components

- `client/src/pages/machine-learning.tsx` - Updated PredictiveAdjustmentsPanel with:
  - Learning Stability card (Phase B)
  - Safety Signals card (Phase D)
  - Explained Adjustments table (Phase A)

---

## UI Features

### Learning Stability Panel

- Stability Score (color-coded: green ≥80%, yellow ≥50%, red <50%)
- Adjustments per hour/day
- Bursty period count
- Parameter touch history with direction indicators

### Safety Signals Panel

- Color-coded severity (info=blue, warning=yellow, alert=red)
- Clear advisory disclaimer
- Signal type and description
- Parameter and timestamp

### Explained Adjustments Table

- Expandable rows showing full trigger context and performance rationale
- Confidence level indicators
- Intent summary with truncation and hover expansion

---

## Explicit Statement of Non-Intervention

**This directive does NOT:**

1. Modify any learning formulas
2. Change any thresholds, scoring, or weight deltas
3. Disable, pause, or dampen ML Calibration
4. Implement P&L-based intervention logic
5. Apply regime-specific biasing
6. Block or alter any system behavior based on safety signals

All features are purely observational and informational.

---

## Success Criteria

Directive 11.7Q is complete when:

- ✅ Predictive adjustments are fully interpretable
- ✅ Learning behavior is transparent but untouched
- ✅ Operators can answer: "Why did the system do this, and is this still healthy?"
- ✅ The system continues learning uninterrupted

---

## Future Directives (Out of Scope)

- Learning dampening or guardrails → Future directive
- QUANT learning activation → Separate directive
- Performance optimization → Later phase
