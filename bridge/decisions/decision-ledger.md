# Decision Ledger

## DEC-2025-NGC-SCL-NOMENCLATURE

**Date:** 2024-12-14  
**Directive:** 8.8.4-B.1 — Signal Quality Evaluator & Normalized Global Confidence Integration

### Decision Summary

Implemented Normalized Global Confidence (NGC) as the primary confidence metric displayed to users, replacing raw strategy confidence. NGC integrates market conditions (volatility, risk) with base confidence to provide a more robust quality signal.

### Key Decisions

1. **NGC Formula:**
   - `NGC = normalize(base_confidence * (1 - volatility) * (1 - risk))`
   - Normalization factor of 0.7 used to scale to 0-1 range

2. **CWQI Formula Updated:**
   - `CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)`
   - ProfitRate = `normalize(ExpectedReturn / ExpectedDuration)`

3. **SQE Thresholds:**
   - MIN_NGC: 0.40
   - MAX_RISK: 0.70
   - MIN_PROFIT_RATE: 0.25
   - MIN_CWQI: 0.50

4. **Architectural Decisions:**
   - Metrics computed upstream in Signal Orchestrator
   - SQE operates as pure filter (no computation)
   - NGC replaces raw confidence in signal payload for UI display

### Files Modified

- `server/core/metrics/quality_index.ts` - NGC, CWQI, extended metrics
- `server/core/filters/signal_quality_evaluator.ts` - NEW SQE filter
- `server/services/signal-orchestrator.ts` - B.1 integration
- `server/core/audit/signal_lifecycle_audit.ts` - SQE_QUALITY_REJECT reason
- `client/src/components/trading/ready-to-buy-table.tsx` - Explanatory text

### Rationale

NGC provides a more conservative and reliable confidence measure that accounts for adverse market conditions, reducing false-positive signals during high volatility periods.
