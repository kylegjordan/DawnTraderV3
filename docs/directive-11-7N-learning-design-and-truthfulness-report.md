# Directive 11.7N — Learning Design, Attribution Integrity, and UI Truthfulness Report

**Date:** 2026-01-28  
**Schema Reference:** directive/v11.7N  
**Status:** ANALYSIS COMPLETE - NO IMPLEMENTATION CHANGES MADE

---

## Executive Summary

This report analyzes the Dawn Trader learning architecture to determine:
- What should learn, how, and why
- Whether each learning system is correctly active or inactive
- Whether the UI displays truthful, meaningful information

**Key Conclusions:**
- ML Calibration is correctly learning from HYBRID trades (proven in Phase B)
- QUANT trades should be learned from separately with different objectives
- 4 learning systems are correctly inactive (wrong data source by design)
- Decision Traceback is mis-scoped and should be suppressed in passive mode
- Lifecycle events should be filtered from Predictive Adjustments UI

---

## Phase C — QUANT Learning Design Audit

### C1. QUANT Trade Characterization

**Sample QUANT Trade (from logs/virtual_trades/2026-01-28.json):**

```json
{
  "id": "vts_VVV_USD_1769582694041",
  "signal": {
    "signalType": "QUANT",
    "patternType": null,          // ← KEY DIFFERENCE: No pattern
    "patternStrength": 0,
    "strategy": "range_trade",
    "regime": "LOW_VOL_CHOP",
    "finalScore": 0.4548,
    "hybridScore": 0.4960,
    "predictiveConfidence": 0.5647,
    "regimeWeight": 0.4773
  },
  "resultType": "stop_loss",
  "netProfit": -0.0418
}
```

**Sample HYBRID Trade (for comparison):**

```json
{
  "id": "vts_PRIME_USD_1769582814043",
  "signal": {
    "signalType": "HYBRID",
    "patternType": "TRI_STAR",    // ← KEY DIFFERENCE: Has pattern
    "patternStrength": 0,
    "strategy": "adaptive_flow",
    "regime": "LOW_VOL_CHOP",
    "finalScore": 0.4538,
    "hybridScore": 0.4890,
    "predictiveConfidence": 0.5418,
    "regimeWeight": 0.4911
  },
  "resultType": "stop_loss",
  "netProfit": -0.0218
}
```

**Field Comparison:**

| Field | QUANT | HYBRID | PATTERN |
|-------|-------|--------|---------|
| patternType | **null** (94%) | Always present | Always present |
| patternStrength | 0 | 0 | 0 |
| strategy | Quant strategies | Pattern-based | Pattern-based |
| finalScore | ✅ Present | ✅ Present | ✅ Present |
| hybridScore | ✅ Present | ✅ Present | ✅ Present |
| predictiveConfidence | ✅ Present | ✅ Present | ✅ Present |
| regimeWeight | ✅ Present | ✅ Present | ✅ Present |
| regime | ✅ Present | ✅ Present | ✅ Present |
| netProfit | ✅ Present | ✅ Present | ✅ Present |

**Trade Volume (Jan 28):**

| Signal Type | Count | Win Rate | Strategies |
|-------------|-------|----------|------------|
| QUANT | 100 (70%) | 30% | range_trade, mean_reversion, vwap_pullback, liquidity_trap |
| HYBRID | 40 (28%) | 20% | adaptive_flow, pivot_shift, volatility_edge, defensive_hedge |
| PATTERN | 2 (2%) | 50% | morning_star, support_bounce |

**Key Differences:**

1. **Pattern Attribution:** QUANT trades have no pattern to attribute performance to
2. **Strategy Types:** QUANT uses purely quantitative strategies; HYBRID combines quant + pattern signals
3. **Volume:** QUANT represents 70% of all VTS trades

---

### C2. Learnability Assessment

#### What CAN Be Learned from QUANT Trades

| Learning Objective | Feasibility | Justification |
|-------------------|-------------|---------------|
| **Strategy Performance** | ✅ Valid | QUANT strategies (range_trade, mean_reversion) have clear P&L attribution |
| **Regime Sensitivity** | ✅ Valid | Each trade has regime tag, can correlate regime → performance |
| **Entry Timing Quality** | ⚠️ Partial | Can measure predicted vs actual profit, but no pattern timing signal |
| **Risk Sizing** | ⚠️ Partial | Position size is fixed (250), not variable |

#### What CANNOT Be Learned Safely from QUANT Trades

| Learning Objective | Risk | Justification |
|-------------------|------|---------------|
| **Pattern Weight Adjustment** | ❌ Invalid | No pattern data exists - would produce null adjustments |
| **Hybrid Score Calibration** | ❌ Dangerous | QUANT hybridScore is computed differently than HYBRID |
| **Pattern Strategy Enable/Disable** | ❌ Invalid | Pattern strategies don't appear in QUANT trades |

#### Arguments AGAINST Learning from QUANT

1. **Mixing Signal Types:** ML Calibration currently produces pattern-specific weight adjustments (MORNING_STAR_weight, TRI_STAR_weight). Adding QUANT trades would require a completely different output structure.

2. **Sample Size Imbalance:** QUANT trades are 70% of volume but have 30% win rate vs HYBRID's 20% win rate. Mixing them would skew calibration toward QUANT's characteristics.

3. **Attribution Confusion:** QUANT trades cannot be attributed to patterns, so any weight adjustment would be meaningless.

---

### C3. Separation Requirements

**Recommendation: FULLY SEPARATE**

| Aspect | QUANT Learning | HYBRID Learning |
|--------|---------------|-----------------|
| Data Source | VTS logs where signalType='QUANT' | VTS logs where signalType='HYBRID' |
| Output | Strategy-level adjustments | Pattern-level weight adjustments |
| Calibration Service | New: StrategyCalibrationService | Existing: MLCalibrationService |
| Shared | None | None |

**Justification:**
1. QUANT lacks pattern data entirely
2. Learning objectives differ (strategy vs pattern weights)
3. Mixing would produce invalid pattern weights from patternless trades
4. Current ML Calibration produces pattern weights only — incompatible with QUANT

**Explicitly Prohibited:**
- Passing QUANT trades to MLCalibrationService (would produce null pattern adjustments)
- Using QUANT trades to adjust HYBRID scoring coefficients

---

## Phase D — Learning System Intake Mapping

| Learning System | Current Data Source | VTS Compatible? | Should Learn from VTS? | Recommendation |
|-----------------|---------------------|-----------------|------------------------|----------------|
| **ML Calibration** | VTS logs (HYBRID) | ✅ Yes | ✅ Yes | **ACTIVE** - Proven working |
| **Heuristic Trader** | DB trades table | ❌ No | ⚠️ TBD | Requires behavioral adaptation, not trade outcomes. Keep inactive until clear use case defined. |
| **Signal Weight Optimizer** | DB predictionOutcomes | ❌ No | ❌ No | Designed for live prediction tracking. VTS doesn't produce predictions in same format. |
| **Cognitive Weight Adjuster** | DB learningSources | ❌ No | ❌ No | Requires user-labeled learning sources. VTS trades are not user-curated. |
| **Adaptive Guardrails** | DB behavioralLog | ❌ No | ❌ No | Behavioral adaptation (UI actions, session patterns) not trade outcomes. |
| **Telemetry Aggregator** | In-memory (VTS Runner) | ✅ Yes | ✅ Yes | **ACTIVE** - Real-time metrics. Consider persistence for resilience. |

### GO / NO-GO Decisions

| System | Verdict | Rationale |
|--------|---------|-----------|
| ML Calibration | **GO** | Proven, working, producing valid adjustments |
| Heuristic Trader | **NO-GO** | Wrong data paradigm (behavioral vs trade) |
| Signal Weight Optimizer | **NO-GO** | Incompatible data format |
| Cognitive Weight Adjuster | **NO-GO** | Requires user curation |
| Adaptive Guardrails | **NO-GO** | Different data domain (behavioral) |
| Telemetry Aggregator | **GO** (already active) | Works, needs persistence consideration |

---

## Phase E — Predictive Adjustments UI Truthfulness Audit

### Current Category Distribution (Jan 28)

| Category | Count | Percentage |
|----------|-------|------------|
| Other | 17 | 74% |
| Weight | 5 | 22% |
| Scoring | 1 | 4% |

### Category Analysis

#### Category: "Weight" (5 entries)

**Trigger:** ML Calibration pattern weight adjustments

**Example:**
```json
{
  "category": "Weight",
  "adjustmentType": "weight_adjustment",
  "parameter": "ml.MORNING_STAR_weight",
  "impact": 0.025,
  "reason": "MLCalibration: DECREASE by -0.0250 perfScore=0 edgeDelta=0.007975"
}
```

**Assessment:** ✅ **DISPLAY** - Represents real system behavior change

---

#### Category: "Scoring" (1 entry)

**Trigger:** Calibration run completion marker

**Example:**
```json
{
  "category": "Scoring",
  "adjustmentType": "model_calibration",
  "parameter": "ml.calibration_run",
  "impact": null,
  "reason": "Scheduled calibration #1: 5 recommendations"
}
```

**Assessment:** ⚠️ **BORDERLINE** - Informative but impact is null. Consider moving to debug view.

---

#### Category: "Other" (17 entries)

**Trigger:** Scheduler initialization, heartbeats, skipped runs

**Examples:**
```json
{
  "category": "Other",
  "adjustmentType": "lifecycle",
  "parameter": "ml.scheduler_init",
  "impact": null,
  "reason": "ML Calibration scheduler initialized successfully"
}
```
```json
{
  "category": "Other", 
  "adjustmentType": "lifecycle",
  "parameter": "ml.scheduler_run",
  "impact": null,
  "reason": "Calibration skipped: No Hybrid trades found for calibration"
}
```

**Assessment:** ❌ **SUPPRESS** - Internal bookkeeping, no user-meaningful behavior change

---

### Recommendations

| Category | Action | Rationale |
|----------|--------|-----------|
| Weight | ✅ Display | Real learning output |
| Risk | ✅ Display (if added) | Real guardrail adjustment |
| Scoring | ⚠️ Display with caution | Summary of calibration run |
| Other/Lifecycle | ❌ Suppress | Internal noise, no user value |

**Should lifecycle/scheduler events appear in Predictive Adjustments?**

**NO.** Lifecycle events should be:
1. Filtered from UI display
2. Logged to a debug-only file (already in place)
3. Never shown to operator as "adjustments"

**Filtering Logic (Future Directive):**
```typescript
// Only display if impact is non-null AND category is Weight/Risk
const shouldDisplay = (adj) => adj.impact !== null && ['Weight', 'Risk'].includes(adj.category);
```

---

## Phase F — Decision Traceback Semantics Clarification

### Current State Analysis

**Function:** `recordDecision()` in `predictive-diagnostics.service.ts`

**Call Sites:** Only in test files (`predictive_diagnostics_integrity.test.ts`)

**Production Calls:** **NONE**

**Current API Response:**
```json
{
  "recentDecisions": [],
  "telemetryStats": {
    "totalSignalsProcessed": null,
    "passRate": null
  }
}
```

### Semantic Determination

#### What constitutes a "decision" in passive learning mode?

A decision should represent:
1. A signal evaluation that reached promotion stage
2. A trade that was either executed or rejected with reason
3. An actionable event with traceable outcome

#### Should VTS simulated trade accept/reject decisions appear?

**YES, but currently not wired.**

VTS processes ~4,000 signals daily and makes accept/reject decisions (Low_ROI, Duplicate_Position, Net_EV_Negative). These are real decisions that could populate Decision Traceback.

#### Should profitability filter rejections appear?

**YES** - Filter rejections are meaningful decisions showing why signals didn't become trades.

### Verdict: MIS-SCOPED

**Current Scope:** Designed for generic decision tracking  
**Actual State:** Not wired to any production code  
**Required Scope:** VTS signal evaluation outcomes

### Recommendation: **SUPPRESS DURING PASSIVE LEARNING**

**Rationale:**
1. Decision Traceback is not wired and shows empty data
2. Wiring it requires non-trivial changes (out of scope for 11.7N)
3. Showing empty UI creates confusion

**Future Directive Candidate:**
- Wire VTS signal evaluation outcomes to `recordDecision()`
- Display VTS accept/reject decisions in Decision Traceback
- Add filter reason visualization

---

## Phase G — Global Friction & Aggregate Metrics Validity

### Data Source Analysis

**Global Friction Computation:**
- File: `server/services/market-indicators.ts`
- Method: `computeGlobalFrictionWithDetails()`
- Source: Live ticker data from Kraken WebSocket

**Current State:**
```json
{
  "friction": null,
  "frictionLevel": null,
  "frictionSampleSize": null
}
```

**Why Null?**

Global Friction requires:
1. Active WebSocket connections
2. Live ticker data with bid/ask spreads
3. Computation across eligible trading pairs

In passive learning mode with VTS simulation, no live trading activity triggers friction calculation.

### Validity Assessment

| Metric | Data Source | Passive Mode Valid? | Rationale |
|--------|-------------|---------------------|-----------|
| Global Friction | Live ticker spreads | ⚠️ Partial | Depends on WebSocket connection, not trading activity |
| Friction Sample Size | Eligible pair count | ⚠️ Partial | Pairs are scanned but friction may not compute |
| Friction Narrative | Friction score thresholds | ❌ Invalid when null | Cannot describe what doesn't exist |

### Recommendation

1. **Global Friction is correctly computed from scanner-level data** when WebSocket is active
2. **It is NOT dependent on live trading** - only on price feeds
3. **In passive mode with null values**, the UI should:
   - Display "Insufficient Data" rather than empty
   - Not show friction indicators at all until data exists
4. **Passive learning should NOT influence friction metrics** - friction is a market condition, not a learning outcome

---

## Final Summary: GO / NO-GO Decisions

### What Is Working

| Component | Status | Evidence |
|-----------|--------|----------|
| ML Calibration (HYBRID) | ✅ **ACTIVE** | 50 trades analyzed, 5 weight adjustments produced |
| Telemetry Aggregator | ✅ **ACTIVE** | VTS Runner calls recordPairTelemetry() |
| VTS Trade Generation | ✅ **ACTIVE** | 1,547 trades created (Jan 21-28) |
| Predictive Adjustments Logging | ✅ **ACTIVE** | 23 entries in today's log |

### What Is Intentionally Inactive

| Component | Reason | Correct? |
|-----------|--------|----------|
| Heuristic Trader | Reads DB trades (behavioral adaptation) | ✅ Correct by design |
| Signal Weight Optimizer | Reads DB predictions (live mode only) | ✅ Correct by design |
| Cognitive Weight Adjuster | Reads DB learning sources (user-curated) | ✅ Correct by design |
| Adaptive Guardrails | Reads DB behavioral log (UI patterns) | ✅ Correct by design |

### What Should Never Learn

| Component | Reason |
|-----------|--------|
| QUANT → ML Calibration | No pattern data, would produce null adjustments |
| Any system → Mixed QUANT+HYBRID | Different learning objectives, would corrupt weights |

### Candidates for Future Directives

| Candidate | Priority | Scope |
|-----------|----------|-------|
| QUANT Strategy Calibration | Medium | New service: StrategyCalibrationService for strategy-level adjustments |
| Decision Traceback Wiring | Low | Wire VTS signal evaluation to recordDecision() |
| Lifecycle Event Filtering | Low | Filter adjustmentType='lifecycle' from UI |
| Telemetry Persistence | Medium | Add durable storage for telemetry data |
| Global Friction Null Handling | Low | UI improvement for "Insufficient Data" state |

---

## Exit Criteria Verification

| Criterion | Status |
|-----------|--------|
| All phases documented | ✅ Complete |
| No implementation changes made | ✅ Verified |
| Learning behavior fully understood | ✅ Documented |
| Clear decision basis for next steps | ✅ Provided |

---

## Appendix: Explicit Non-Goals (Confirmed Not Addressed)

- ❌ "Make learning more active" - Not done
- ❌ "Improve performance" - Not done
- ❌ "Increase trade count" - Not done
- ❌ "Make charts move" - Not done

---

**Report Generated:** 2026-01-28T18:00:00Z  
**Schema:** directive/v11.7N  
**No Code Changes Made**
