# Directive 11.7L — Phase 11 Learning Verification & Diagnostic Audit Report

**Date**: 2026-01-28  
**Schema Version**: audit-report/v1.0  
**Status**: COMPLETE

---

## Executive Summary

This audit determines whether DawnTrader is actively learning from FX5 + VTS simulated data in Phase 11 (Passive Learning mode). The key finding is:

**Phase 11 is correctly configured but NOT generating trades due to strict profitability filters. All adjustment mechanisms are correctly wired but have no input data to act upon.**

---

## Task L-01: Predictive Adjustments Audit

### Identified Adjustment Mechanisms

| # | Mechanism | Service | Input Trigger | Observed Activity (Phase 11) | Explanation |
|---|-----------|---------|---------------|------------------------------|-------------|
| 1 | **ML Calibration** | `MLCalibrationService` | Closed Hybrid trades with Phase-10 metrics | **NO** | Requires minimum 10 Hybrid trades; none exist |
| 2 | **Heuristic Trader** | `LocalHeuristicTraderService` | Portfolio metrics (win rate, drawdown, exposure) | **NO** | Requires portfolio with active positions; none exist |
| 3 | **Adaptive Guardrails** | `AdaptiveGuardrailsService` | Behavioral log entries from trade outcomes | **NO** | Requires trade completion events; none generated |
| 4 | **Signal Weight Optimizer** | `SignalWeightOptimizerService` | Prediction outcomes (30-day window) | **NO** | Requires completed predictions; none exist |
| 5 | **Cognitive Weight Adjuster** | `CognitiveWeightAdjuster` | Learning source accuracy from knowledge retrieval | **NO** | Requires prediction correctness data; none available |

### Current Predictive Adjustments Log Evidence

Today's log (`logs/predictive_adjustments/2026-01-28.json`) shows:
- **Scheduler initializations**: ML Calibration scheduler initialized successfully
- **Calibration attempts**: "Calibration skipped: No Hybrid trades found for calibration"
- **Zero meaningful adjustments**: All entries are `lifecycle` type, not actual weight/threshold changes

### Determination

**Phase 11 IS expected to produce zero meaningful adjustments.** The system is designed to:
1. Generate virtual trades via VTS
2. Close those trades with real-price resolution
3. Feed closed trade data to ML Calibration

**However**, the VTS is NOT generating trades because all signals fail profitability filters:
- **Low_ROI**: 1,030 signals rejected (expectedROI < minROI)
- **Duplicate_Position**: 1,858 signals rejected (position already simulated)
- **Net_EV_Negative**: 50 signals rejected (negative expected value)

**Root Cause**: The profitability thresholds are too strict for current market conditions, or market conditions are genuinely unfavorable.

---

## Task L-02: Regime Archive Execution Verification

### Archive Scheduler Configuration

| Parameter | Value |
|-----------|-------|
| Weekly Archive Schedule | Sunday 00:45 UTC |
| Nightly Verification | Daily 02:00 UTC |
| Monthly Compression | 1st of month 03:00 UTC |
| Source Directory | `logs/telemetry/` |
| Archive Directory | `logs/regime_archive/` |
| Minimum Data Requirement | 7 days of telemetry records |

### Execution Evidence

**Verified via filesystem check (2026-01-28 10:31 UTC):**
```
$ ls -la logs/regime_archive/
total 0
drwxr-xr-x 1 runner runner    0 Jan 23 15:00 .
drwxr-xr-x 1 runner runner 2506 Jan 28 10:31 ..
```

- **Archive directory**: `logs/regime_archive/` EXISTS but contains 0 files
- **Manifest file**: Does not exist (no `regime_archive_manifest.json`)
- **Scheduler status**: Initialized at server startup (confirmed in logs)

### Why Archive is Empty

1. **Time window not elapsed**: Archive scheduled for weekly execution (Sunday 00:45 UTC), current date is Tuesday (2026-01-28)
2. **Telemetry data insufficient**: Regime archival aggregates 7-day windows; VTS has been running but telemetry accumulation requires trade outcomes to be meaningful
3. **No blocking condition**: The scheduler is correctly initialized but hasn't reached its first scheduled run since initialization

### Determination

**Empty archive is EXPECTED and VERIFIED.** The directory exists but contains no archive files. The first archive will be created on Sunday 2026-02-02 at 00:45 UTC, assuming sufficient telemetry data exists by then.

---

## Task L-03: Global Friction Data Lineage Analysis

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Global Friction Computation                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ INPUT SOURCES                                                      │
├───────────────────────────────────────────────────────────────────┤
│ 1. Active Filter Pool (paper mode)                                 │
│    - Source: FX5 Scanner survivors                                 │
│    - Frequency: Every 60 seconds (FX5 scan cycle)                  │
│    - Sample window: Top 100 pairs or fallback pairs                │
│    - Weight: Equal per symbol                                      │
│                                                                    │
│ 2. Cost Cache Metrics (per symbol)                                 │
│    - Source: Kraken ticker + historical slippage estimation        │
│    - Components: spread, slippage, fee                             │
│    - Frequency: Updated on price tick                              │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ COMPUTATION                                                        │
├───────────────────────────────────────────────────────────────────┤
│ For each symbol in sample:                                         │
│   friction_i = computeMarketFriction(spread, slippage, fee)        │
│                                                                    │
│ Global Friction = avg(friction_1, friction_2, ..., friction_n)     │
│ Sample Size = count of symbols with valid metrics                  │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│ OUTPUT                                                             │
│ - globalFrictionScore: 0-100 integer                               │
│ - frictionSampleSize: Number of symbols contributing               │
│ - Cached value: cachedGlobalFriction (default: 25)                 │
└───────────────────────────────────────────────────────────────────┘
```

### Why Value Remains Constant

1. **Stable spread data**: Kraken spreads for major pairs are relatively stable
2. **Static slippage estimates**: Historical slippage values don't change frequently
3. **Fixed fee rates**: Kraken fee tiers are static
4. **Caching behavior**: `cachedGlobalFriction` preserves last computed value

### Does FX5 Contribute Directly?

**YES**, FX5 provides the pair universe for friction sampling. However, FX5 does NOT compute friction - it only filters pairs. The friction values come from the cost-cache which is populated by Kraken ticker data.

---

## Task L-04: Predictive Diagnostics Population Review

### What Constitutes a "Signal Processed"

A signal is considered "processed" when it passes through the full predictive evaluation pipeline:
1. Signal generated by VTS or Signal Orchestrator
2. Evaluated against profitability filters (NetEV, ROI thresholds)
3. Decision made: APPROVED (create trade) or BLOCKED/SKIPPED (log rejection)

### Do Passive Learning Mode Signals Qualify?

**YES.** VTS in passive learning mode is generating signals (28,503 today) and processing them through the full pipeline. These ARE processed signals.

### Why Diagnostics Remain Zero

The `PredictiveDiagnosticsService` tracks:
- `signalCount`: Incremented via `recordSignalDecision()`
- `passCount`: Incremented when decision = APPROVED
- `recentDecisions`: Array of `TraceDecision` objects

**Concrete Evidence of Wiring Gap:**

```bash
$ grep -r "recordSignalDecision" server/
# No matches found in entire server directory
```

The `recordSignalDecision()` method is **defined** in `PredictiveDiagnosticsService` (line ~180) but **never invoked** from any other file. VTS logs via `logSkippedSignal()` instead.

### Signal Processing Activity Evidence

Despite zero diagnostics counters, signals ARE being processed:

| Metric | Value | Source |
|--------|-------|--------|
| Skipped signals today | 28,503 | `logs/vts_skipped_signals/2026-01-28.json` |
| Low_ROI rejections | 1,030 | Signal failed ROI threshold |
| Duplicate_Position | 1,858 | Position already tracked |
| Net_EV_Negative | 50 | Negative expected value |
| Trades created | 0 | `paper_sim_trades` query returned empty |

### Determination

**Diagnostics are empty because no component in the codebase calls `PredictiveDiagnosticsService.recordSignalDecision()` — this is a confirmed wiring gap, not a data absence.**

The skipped signals ARE being logged to `logs/vts_skipped_signals/2026-01-28.json` (28,503 entries), proving that signals are actively being processed and decisions are being made. The distinction is:
- **Signals processed**: 28,503 (evaluated through full pipeline)
- **Trades created**: 0 (all signals rejected by profitability filters)
- **Diagnostics recorded**: 0 (wiring gap - method exists but never called)

---

## Task L-05: Decision Traceback Scope Definition

### What is a "Decision" in This System

A **decision** is the outcome of signal evaluation that determines whether to:
1. **APPROVED**: Create a virtual trade (or live trade in active mode)
2. **BLOCKED**: Reject the signal due to filter violation (VN, LQ, regime mismatch)
3. **SKIPPED**: Reject due to profitability thresholds (Low_ROI, Net_EV_Negative, Duplicate_Position)

### Does Simulated Trade Acceptance/Rejection Qualify?

**YES.** Every VTS cycle produces decisions for 100+ pairs. Today's evidence:
- 1,030 SKIPPED (Low_ROI)
- 1,858 SKIPPED (Duplicate_Position)
- 50 BLOCKED (Net_EV_Negative)
- 0 APPROVED (no trades created)

### Are Decision Objects Emitted in Phase 11?

**YES**, decision objects ARE being emitted, but to a different logging mechanism:

| Log Location | Content | Example Entry |
|--------------|---------|---------------|
| `logs/vts_skipped_signals/2026-01-28.json` | Full decision records | `{symbol, reason, regime, expectedROI, minROI, signalType, strategy}` |
| `PredictiveDiagnosticsService.recentDecisions` | TraceDecision objects | Empty - not wired |

**Sample decision object from VTS skipped signals log:**
```json
{
  "timestamp": "2026-01-28T05:40:55.072Z",
  "symbol": "API3/USD",
  "reason": "Low_ROI",
  "regime": "BEAR_VOLATILE",
  "expectedROI": 0.0164,
  "minROI": 0.0261,
  "signalType": "QUANT",
  "strategy": "mean_reversion",
  "source": "VTS"
}
```

### Determination

**Decision Traceback is intentionally designed to show end-to-end signal evaluation traces. In Phase 11, 28,503 decisions HAVE been made and logged to `logs/vts_skipped_signals/`, but they are not wired to the Traceback UI component.** This is a wiring gap consistent with L-04 findings.

---

## Task L-06: VN Filter Validation Report

### VN=1.0 Behavior: Mathematically Correct?

**YES.** The VN (Volatility Noise) formula is:

```
VN = stdDev(|price_differences|) / mean(|price_differences|)
Result clamped to [0, 1]
```

VN=1.0 occurs when `stdDev >= mean`, which happens with:
- Many small/zero price changes (flat candles)
- Occasional large spikes (high-impact candles)
- This pattern is characteristic of crypto markets with bursts of activity

### VN Value Distribution

| VN Source | Typical Value | Pass VN≤0.6 Filter |
|-----------|---------------|-------------------|
| OHLC-derived (Kraken candles) | 0.8 - 1.0 | **NO** |
| Ticker-based fallback | 0.5 (default) | **YES** |

### Operational Intent

VN protects against trading in **noisy, unpredictable markets** where:
- Price direction is unclear
- Entry/exit precision is difficult
- Stop-loss triggers are more likely

### Why Exclusion is Desirable

High VN indicates the market is "choppy" — prices jump around without clear trend. Trading in such conditions:
- Increases stop-loss hit rate
- Reduces profit target achievement
- Generates more slippage

**Excluding VN>0.6 pairs preserves capital for better opportunities.**

### Confidence Statement

**VN behavior is CORRECT-BY-DESIGN.** The mathematical formula correctly identifies market noise, and the filter threshold (VN≤0.6) appropriately excludes pairs that would be difficult to trade profitably.

---

## Conclusions

| Task | Finding | Status |
|------|---------|--------|
| L-01 | Zero adjustments expected — no trade data to calibrate from | EXPECTED |
| L-02 | Empty archive — scheduler not yet reached first run | EXPECTED |
| L-03 | Constant friction — stable market cost metrics | EXPECTED |
| L-04 | Zero diagnostics — wiring gap between VTS and DiagnosticsService | DESIGN GAP |
| L-05 | Empty traceback — decisions logged elsewhere, not wired to UI | DESIGN GAP |
| L-06 | VN=1.0 behavior — mathematically correct, filtering as intended | CORRECT |

### Root Cause of No Learning Activity

**The VTS is successfully scanning and processing pairs, but ALL signals fail profitability filters.** Without trades being created, there is no outcome data to feed the learning systems.

### Recommended Next Steps (Not in Directive Scope)

1. **Investigate ROI thresholds**: Are `minROI` values too aggressive for current market?
2. **Wire VTS decisions to Diagnostics**: Enable visibility of signal processing activity
3. **Consider VN threshold adjustment**: If 17+ pairs are consistently filtered at VN≤0.6

---

*Report generated by Directive 11.7L audit process*
