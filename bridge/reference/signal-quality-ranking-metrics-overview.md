# Signal Quality & Ranking Metrics Overview

## Overview

The Dawn Trader Signal Quality Framework ranks and filters generated signals to ensure that only the highest-quality opportunities occupy limited trade capacity. This system unifies confidence, risk, efficiency, and profitability into a single composite metric: **CWQI (Composite Weighted Quality Index)**.

---

## 1. Normalized Global Confidence (NGC)

**Purpose:** Represent signal reliability on a universal 0–1 scale across all strategies.

**Formula:**
```
NGC = normalize(baseConfidence × (1 - volatility) × (1 - riskScore))
```

**Rolling normalization:**
```
NGC_norm = (NGC - NGC_min_rolling) / (NGC_max_rolling - NGC_min_rolling)
```

Updated every scan cycle using last 500 signals.

---

## 2. Enhanced Risk Metric

**Purpose:** Capture both inherent trade risk and portfolio correlation exposure.

**Formula:**
```
Risk = (|Entry - Stop| / Entry) / ATR × CorrPenalty
```

Where:
```
CorrPenalty = 1 + max(0, Corr_ij_adj - 0.8)
```

And:
```
Corr_ij_adj = Corr_ij_prev × e^(-0.05 × Age_minutes)
```

Correlations computed from cached OHLCV data; decayed if older than 10 min.

---

## 3. Expected Return (ER)

**Purpose:** Estimate normalized potential return adjusted for instrument behavior.

**Formula:**
```
ER_norm = (ER - ER_min_rolling) / (ER_max_rolling - ER_min_rolling)
```

---

## 4. ProfitRate

**Purpose:** Express efficiency — profit potential per expected duration.

**Formula:**
```
ProfitRate = ExpectedReturn / ExpectedDuration
```

Rolling normalization applied as in (1).
Minimum floors enforced per strategy via config:
- DHMA: 0.22
- VWAP_Bounce: 0.25
- MeanReversion: 0.28
- Breakout: 0.30
- Scalper: 0.35

---

## 5. CWQI – Composite Weighted Quality Index

**Purpose:** Final signal-quality rank used in Ready-to-Buy queue.

**Formula:**
```
CWQI = (NGC_norm × 0.40) + ((1 - Risk) × 0.25) + (ER_norm × 0.20) + (ProfitRate_norm × 0.15)
```

**Durability decay:**
```
CWQI_final = CWQI × e^(-0.03 × t_minutes)
```

---

## 6. Signal Flow Summary

1. **FX5 Scanner** → provides OHLCV and ATR streams (30s Tier A / 10 min Tier B)
2. **Signal Orchestrator** → computes extended metrics (NGC, ER, ProfitRate, CWQI)
3. **Signal Quality Evaluator (SQE)** → filters using thresholds:
   - NGC ≥ 0.40
   - Risk ≤ 0.70
   - ProfitRate ≥ strategy floor
   - CWQI ≥ 0.50
4. **Ready-to-Buy Queue** → ranks by CWQI, applies decay over time
5. **Trade Capacity Limits (TCL)** → fills open-trade slots based on ranked priority
6. **Execution Engine** → opens positions for top-ranked signals

---

## 7. Data Integrity & Performance Notes

- All metrics computed in-memory, updated each scan cycle
- Correlation matrix cached and decayed; no new Kraken calls
- Rolling statistics and decay are O(1) updates, safe for real-time operation
- Diagnostic logs tagged by subsystem for audit and profiling

---

## 8. Revision History

| Version | Directive | Summary |
|---------|-----------|---------|
| 8.8.4-B.1 | Earlier | Introduced NGC & SQE - Universal confidence metric |
| 8.8.4-B.2 | Earlier | SQE thresholds surfaced in UI - Filter visualization |
| 8.8.4-B.3 | Earlier | Confidence replacement verified - NGC propagation complete |
| 8.8.4-C | Current | Adaptive normalization, enhanced risk, CWQI decay - Full quality optimization |
