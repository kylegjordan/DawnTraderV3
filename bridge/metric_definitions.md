# Metric Definitions — DawnTrader V3.1

**Schema**: `metrics-calibration/v1.2`  
**Last Updated**: January 23, 2026  
**Directive**: 11.7H — VN Metric Normalization & Cross-Mode Parity

---

## Core Quantitative Metrics

### Log-Liquidity (LQ)

**Definition**: Logarithmic liquidity index measuring market depth and trading activity.

**Formula**:
```
LQ = 10 × (log(V × C) - log(S / C) - 10)
```

Where:
- `V` = 24-hour trading volume (USD)
- `C` = Trade count (24h)
- `S` = Bid-ask spread

**Range**: 0–100  
**Thresholds**:
- Active Trading: `LQ >= 40` (SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE)
- Passive Learning: `LQ >= 40` (IMF_THRESHOLDS.LQ_MIN)

**Interpretation**:
- High LQ (>70): Deep liquidity, tight spreads, low slippage risk
- Mid LQ (40-70): Moderate liquidity, acceptable for trading
- Low LQ (<40): Illiquid, high spread risk, excluded from trading universe

---

### Volatility Noise (VN)

**Definition**: Ratio of the standard deviation to the mean absolute deviation of sequential price differences. Quantifies market choppiness and stability.

**Canonical Formula** (analysis-utils.ts):
```
diffs = |price[i+1] - price[i]|  for all consecutive pairs
VN = stdDev(diffs) / mean(diffs)
```

**Range**: 0–1 (clamped)  
**Typical Values**: 0.2–0.7 for stable markets

**Thresholds**:
- Active Trading: `VN <= 0.6` (SYSTEM_GUARDS.MAX_VOL_NOISE)
- Passive Learning: `VN <= 0.8` (IMF_THRESHOLDS.VN_MAX)

**Interpretation**:
- Low VN (<0.3): Smooth, trending market
- Mid VN (0.3-0.6): Normal market conditions
- High VN (0.6-0.8): Choppy, unstable conditions
- Extreme VN (>0.8): Highly erratic, excluded from consideration

**Cross-Mode Parity (Directive 11.7H)**:
Both passive learning (OHLC cache) and active trading (ticker feed) use the identical canonical formula from `analysis-utils.ts`. This ensures ML calibration data matches live trading conditions.

---

### Directional Integrity (DI)

**Definition**: Measures directional persistence (trend straightness).

**Formula**:
```
DI = (|price_final - price_initial| / sum(|consecutive_diffs|)) × 100
```

**Range**: 0–100  
**Thresholds**:
- Trending: `DI >= 65`
- Choppy: `DI < 30`

**Interpretation**:
- High DI (>65): Strong, persistent trend
- Mid DI (30-65): Mixed directional behavior
- Low DI (<30): Ranging/choppy market, no clear direction

---

### Sigma (σ)

**Definition**: Standard deviation of price differences over a rolling window. Adaptive volatility estimator.

**Formula**:
```
σ = stdDev(price_diffs[-window:])
```

**Default Window**: 20 periods

**Use Case**: 3σ spike detection for entry/exit timing.

---

## Threshold Governance

All thresholds are centralized in `/server/config/system-guards.ts`:

| Metric | Active Trading | Passive Learning | Constant |
|--------|----------------|------------------|----------|
| LQ Min | 40 | 40 | `MIN_LIQUIDITY_SCORE` / `IMF_THRESHOLDS.LQ_MIN` |
| VN Max | 0.6 | 0.8 | `MAX_VOL_NOISE` / `IMF_THRESHOLDS.VN_MAX` |
| Correlation Max | 0.75 | 0.95 | `CORRELATION_THRESHOLD` / `IMF_THRESHOLDS.CORR_MAX` |

---

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| v1.2 | 2026-01-23 | Directive 11.7H: Unified VN formula, cross-mode parity |
| v1.1 | 2026-01-15 | IMF metrics module introduced |
| v1.0 | 2025-12-13 | Initial Phase 9.1 metrics |
