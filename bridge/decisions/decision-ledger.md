# Decision Ledger

## DEC-2025-NGC-SCL-NOMENCLATURE

**Date:** 2024-12-14  
**Directive:** 8.8.4-B.1 / B.2 — Signal Constraint Layer Architecture & NGC Metric

### Decision Summary

Adopted Signal Constraint Layer (SCL) architecture with Normalized Global Confidence (NGC) as the primary confidence metric. NGC integrates market conditions (volatility, risk) with base confidence to provide a more robust quality signal. All normalization uses min-max range-based scaling for consistent [0,1] output.

### Key Decisions

1. **NGC Formula:**
   - `NGC = normalize(base_confidence * (1 - volatility) * (1 - risk))`
   - Min-max normalization: `(raw - MIN) / (MAX - MIN)`
   - Observed range: NGC_MIN = 0.15, NGC_MAX = 0.70

2. **ProfitRate Normalization:**
   - `ProfitRate = normalize(ExpectedReturn * 60 / ExpectedDuration)`
   - Observed range: PROFITRATE_MIN = 0.002, PROFITRATE_MAX = 0.80

3. **CWQI Formula:**
   - `CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)`

4. **SQE Thresholds:**
   - MIN_NGC: 0.40
   - MAX_RISK: 0.70
   - MIN_PROFIT_RATE: 0.25
   - MIN_CWQI: 0.50

5. **Architectural Decisions:**
   - Metrics computed upstream in Signal Orchestrator
   - SQE operates as pure filter (no computation)
   - NGC replaces raw confidence in signal payload for UI display
   - Normalization parameters stored in `config/metrics.json`

### Configuration (B.2)

Normalization parameters are externalized to `config/metrics.json`:
```json
{
  "NGC_MIN": 0.15,
  "NGC_MAX": 0.70,
  "PROFITRATE_MIN": 0.002,
  "PROFITRATE_MAX": 0.80
}
```

### Files Modified

- `server/core/metrics/quality_index.ts` - NGC, CWQI, extended metrics, config loading
- `server/core/filters/signal_quality_evaluator.ts` - SQE filter service
- `server/services/signal-orchestrator.ts` - B.1 integration
- `server/core/audit/signal_lifecycle_audit.ts` - SQE_QUALITY_REJECT reason
- `client/src/components/trading/ready-to-buy-table.tsx` - Explanatory text
- `config/metrics.json` - Normalization configuration (B.2)

### Rationale

NGC provides a more conservative and reliable confidence measure that accounts for adverse market conditions, reducing false-positive signals during high volatility periods. Externalized configuration allows tuning normalization ranges without code changes.
