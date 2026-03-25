# Artifact 3 — Layer-Responsibility Matrix

**Audit**: Strategy-Family Filter Profiles
**Date**: 2026-03-23
**Status**: Complete

---

## Layer Definitions

| Layer | Purpose | When It Runs | Rejection = |
|-------|---------|-------------|-------------|
| **Global Filters** | Universal disqualifiers no strategy should want | FX5 scan, before IMF | Pair excluded from ALL paths |
| **IMF Filters** | Path-specific quality gates (quant vs pattern) | FX5 scan, after global | Pair excluded from ONE path |
| **Family Filters** | Strategy-family-specific thresholds (NEW) | After global, before/alongside IMF | Pair excluded from specific family |
| **MCE Regime** | Market context + regime classification | Signal orchestrator | Determines which strategies run |
| **Strategy Detection** | Does a valid setup exist for this strategy? | Signal orchestrator loop | Strategy returns null |
| **Scoring / Weighting** | How strong is the setup? | FinalScore computation | Low score = low queue rank |
| **Hard Gates** | Portfolio/risk/execution eligibility | SQE + RTB + Guards | Signal rejected or queued |

---

## Current Check Placement (What Lives Where)

### Global Filters (Universal — Apply to ALL 300 Pairs)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| Minimum volume (USD) | Global | **Yes** | No strategy wants illiquid pairs |
| Maximum bid-ask spread | Global | **Yes** | Universal market quality |
| Minimum price ($0.25) | Global | **Yes** | Cost structure constraint |
| Maximum price | Global | **Yes** | Position sizing constraint |
| Minimum market cap | Global | **Yes** | Liquidity proxy |
| Exclude stablecoins | Global | **Debatable** | Some strategies might want stable pairs for range trading |
| Minimum history days | Global | **Needs split** | Trend strategies need 30+ days; pattern strategies need 14 days |

### IMF Filters (Path-Specific — Quant vs Pattern)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| LQ minimum (35 quant / 20 pattern) | IMF | **Needs family split** | Trend strategies want LQ ≥ 40; reversal/oscillator can use LQ ≥ 25 |
| VN maximum (0.93 quant / 0.98 pattern) | IMF | **Needs family split** | Trend wants VN ≤ 0.60; noise-loving strategies tolerate VN ≤ 0.85 |
| CORR maximum (0.92 quant / 0.95 pattern) | IMF | **OK as-is** | Correlation is universally unwanted |
| DI minimum (pattern only: 30) | IMF | **Needs family split** | Trend wants DI ≥ 55; oscillator wants DI ≤ 35 (inverted!) |

### VN Veto (Pre-MCE Hard Gate)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| Extreme noise veto (VN > 0.93) | Pre-MCE gate | **OK** | Prevents wasting MCE compute on extreme noise |

### MCE Regime (Strategy Selection)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| Regime classification | MCE | **Yes** | Core architectural purpose |
| allowedStrategies filtering | MCE → Strategy intersection | **Yes** | Correctly limits strategies to regime-appropriate ones |
| regimeWeight computation | MCE | **Yes** | Used in FinalScore weighting |

### Strategy Detection (Setup Existence)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| SMA crossover detection | Strategy | **Yes** | Strategy-specific setup |
| VWAP proximity check | Strategy | **Yes** | Strategy-specific setup |
| Pattern strength threshold | Strategy | **Yes** | Pattern-specific quality |
| RSI overbought/oversold | Strategy | **Maybe move to family filter** | RSI 15-85 is universal for oscillator family |
| ADX > 25 guard (sma_trend_ride only) | Strategy + Hard Gate | **Dual-layer OK** | Strategy-specific with explicit guard |

### Scoring / Weighting

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| FinalScore computation | Scoring | **Yes** | Weighted: hybrid 0.4 + confidence 0.3 + regime 0.2 - decay 0.1 |
| hybridScore computation | Scoring | **Yes** | Hybrid-specific quality score |
| DBS confidence modifier | Scoring | **Yes** | Directional bias adjustment |

### Hard Gates (Execution Eligibility)

| Check | Current Layer | Correct Layer? | Notes |
|-------|--------------|----------------|-------|
| FinalScore ≥ 0.35/0.45 | SQE | **Yes** | Quality floor |
| RegimeWeight ≥ 0.30 | SQE | **Yes** | Regime confidence floor |
| ROI > dynamic threshold | SQE | **Yes** | Profitability gate |
| Confidence floor | SQE | **Yes** | Signal quality floor |
| Net EV > VTS floor | VTS guard | **Yes** | VTS-specific profitability gate |
| ADX > 25 (sma_trend_ride) | Strategy guard | **OK** | Strategy-specific hard requirement |
| Duplicate position (pair+strategy) | VTS guard | **Yes** | Max 1 per combo |
| Max open trades | VTS/RTB guard | **Yes** | Portfolio capacity |
| Pair-level promotion guard | RTB | **Yes** | No simultaneous trades on same pair |
| Kill switch | Guardrail | **Yes** | Emergency halt |
| Daily loss limit | Guardrail | **Yes** | Risk management |

---

## RECOMMENDED CHANGES FOR FAMILY-AWARE FILTERING

### Checks That Should Move to Family Filters

| Check | Current Layer | Proposed Layer | Rationale |
|-------|--------------|----------------|-----------|
| VN maximum | IMF (one-size-fits-all per path) | **Family IMF** | Trend family: VN ≤ 0.60. Reversal: VN ≤ 0.75. Oscillator: VN ≤ 0.85. Breakout: VN ≤ 0.68 |
| DI minimum | IMF (pattern only) | **Family IMF** | Trend: DI ≥ 55. Reversal: DI ≤ 35 (INVERTED). Oscillator: DI ≤ 30. Breakout: DI ≥ 45 |
| LQ minimum | IMF (35/20 split) | **Family IMF** | Trend: LQ ≥ 40. Reversal: LQ ≥ 30. Oscillator: LQ ≥ 25. Breakout: LQ ≥ 35 |
| minHistoryDays | Global (30 for all) | **Family Global** | Trend: 30+. Pattern: 14. Oscillator: 21 |

### Checks That Should Stay Universal

| Check | Layer | Rationale |
|-------|-------|-----------|
| Minimum volume | Global | No strategy wants illiquid pairs |
| Maximum spread | Global | Universal market quality (though threshold may vary) |
| Minimum price | Global | Cost structure — universal |
| CORR maximum | IMF | High correlation is universally undesirable |
| VN extreme veto | Pre-MCE gate | Prevents compute waste |

### New Family Filter Profiles (CANDIDATE — Needs Calibration)

> **NOTE**: The thresholds below are **preliminary design recommendations**, NOT audit-proven optimal values. They are informed by the audit's analysis of current filter behavior, strategy requirements, and DI/VN characteristics. Final values must be calibrated through telemetry data collection during implementation.

| Family | Strategies | VN Max (candidate) | DI Range (candidate) | LQ Min (candidate) | History Days (candidate) |
|--------|-----------|--------|----------|--------|-------------|
| **Trend** | vwap_pullback, sma_trend_ride, breakout, dhma | ≤ 0.60 | ≥ 55 | ≥ 40 | 30 |
| **Reversal** | mean_reversion, range_trade, liquidity_trap | ≤ 0.85 | ≤ 35 | ≥ 25 | 21 |
| **Breakout** | breakout, vwap_bounce | ≤ 0.68 | ≥ 45 | ≥ 35 | 21 |
| **Oscillator** | rsi_oversold, bollinger_reversion, stochastic | ≤ 0.85 | ≤ 30 | ≥ 25 | 14 |
| **Pattern** | morning_star, inside_bar_reversal, support_bounce, abcd_long | ≤ 0.98 | ≥ 20 | ≥ 18 | 14 |
| **Hybrid** | pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge | Inherited | Inherited | Inherited | Inherited |

### Key Insight: DI is INVERTED for Some Families

- **Trend/Breakout families WANT high DI** (directional persistence)
- **Reversal/Oscillator families WANT low DI** (choppy/ranging conditions)
- Current one-size-fits-all DI minimum (≥ 30 or ≥ 55) **starves reversal/oscillator strategies**
- Family-aware DI filtering should use DI_MAX for reversal/oscillator, DI_MIN for trend/breakout

---

## Redundant Gating (Checks Applied Twice)

| Check | Layer 1 | Layer 2 | Issue |
|-------|---------|---------|-------|
| VN threshold | IMF filter (VN ≤ 0.93) | VN veto pre-MCE (VN > 0.93) | **Redundant** — IMF already filters, VN veto re-checks |
| Pattern strength | Pattern IMF (DI ≥ 30) | Strategy detect (pattern.strength check) | **Acceptable** — different aspects (DI vs pattern quality) |

**Note**: VN veto redundancy is harmless (same threshold, different code path) but could be consolidated.
