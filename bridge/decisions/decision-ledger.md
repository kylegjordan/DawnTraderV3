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

---

## DEC-2025-B3-SIGNAL-FLOW-CORRECTION

**Date:** 2024-12-14  
**Directive:** 8.8.4-B.3 — Signal Flow Correction & Confidence Source Consolidation

### Decision Summary

Corrected the signal processing flow in Signal Orchestrator to follow the canonical order: Sizing → Metrics → SQE → RTB → TCL. Consolidated NGC as the single authoritative source of confidence, deprecating the legacy Confidence Threshold filter from the UI.

### Key Changes

1. **Signal Flow Correction:**
   - **Previous (incorrect):** Metrics → SQE → Sizing
   - **Corrected:** Sizing → Metrics → SQE
   - Rationale: Sizing must happen first to determine position viability before computing quality metrics

2. **NGC as Single Confidence Source:**
   - NGC replaces raw strategy confidence in all signal payloads
   - `sizedSignal.confidence = extendedMetrics.ngc`
   - Ensures consistent confidence representation across UI and backend

3. **Legacy Filter Deprecation:**
   - Removed `confidenceThreshold` filter from UI visibility
   - SQE thresholds (MIN_NGC, MIN_CWQI) are now the authoritative quality gates
   - Backend filter data retained for compatibility but hidden from users

4. **Flow Verification Logging:**
   - Added `[B.3][FLOW_CORRECTED]` log on SignalOrchestrator start
   - Step-by-step logging: `[B.3][SIZING]`, `[B.3][METRICS]`, `[B.3][SQE_PASS/REJECT]`, `[B.3][SIZED_SIGNAL]`

### RTB Queue Integration

The RTB (Ready-to-Buy) queue handles capacity-blocked signals:
- Signals passing SQE are forwarded to TradingEngine (TCL)
- If blocked by capacity guardrails (MAX_TRADES, MAX_EXPOSURE), signals queue in RTB
- RTB ranks queued signals by CWQI for promotion priority
- This integration happens at TradingEngine level, not SignalOrchestrator

### Files Modified

- `server/services/signal-orchestrator.ts` - Flow reordering, B.3 logging, NGC consolidation
- `client/src/components/goals/filters-with-override.tsx` - Deprecated confidenceThreshold filter

### Canonical Signal Flow

```
Strategy → GENERATION → SIZING → METRICS → SQE → RTB/TCL → EXECUTION
            (raw)       (qty)    (NGC,CWQI) (filter) (queue/exec)
```

### Rationale

The previous flow computed metrics before sizing, which could lead to wasted computation on signals that would fail sizing. By sizing first, we efficiently filter out non-viable signals early. NGC consolidation ensures users see a single, consistent confidence metric that already accounts for market conditions.
