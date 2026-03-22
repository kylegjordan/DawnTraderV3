# Directive 12.3.3: Confidence Authority Cleanup (NGC Removal)

**Status**: COMPLETE
**Date Issued**: 2026-03-03
**Date Complete**: 2026-03-03
**Batch**: 13 (Phase 12.3 Pipeline Unification mega-batch)
**Commit**: `4d8ef060` (code in checkpoint `67afdc1e`)

---

## Problem Statement

NGC (Normalized Global Confidence) was a legacy metric that should have been removed but remained deeply wired into the active pipeline:

1. **Opaque computation**: Raw NGC used a complex rolling normalization that introduced temporal drift and distribution compression — effectively a no-op since values were already in [0,1]
2. **Double-normalization**: RollingNormalizer class applied exponential boundary smoothing to already-normalized inputs
3. **VTS coupling**: Smoothing rate was driven by VTS learning parameters (`learningRate * (gsi + 0.15)`) — unnecessary coupling between validation simulator and scoring
4. **Confidence contamination**: NGC flowed as the `confidence` carrier in signal-orchestrator.ts, directly feeding FinalScore calculations with a legacy metric

**NGC Formula (before fix)**:
```
Step 1: baseNGC = (confidence * 0.5) + ((1 - volatility) * 0.3) + ((1 - risk) * 0.2)
Step 2: normalize(baseNGC) via RollingNormalizer (stateful, temporal drift)
Step 3: NGC = (baseNGC_normalized * 0.4) + (profitRate * 0.4) + ((1-risk) * 0.2)
```

## Resolution

### Deterministic Confidence Formula

`calculateNGC()` internals replaced with a deterministic formula that preserves the function signature for backward compatibility:

**New base confidence**:
```
confidence = (stratConf * 0.60) + ((1 - volatility) * 0.20) + ((1 - risk) * 0.20)
```

**New extended confidence** (profitability-informed):
```
extendedConfidence = (baseConfidence * 0.50) + (profitRate * 0.30) + ((1 - risk) * 0.20)
```

### What Changed

- `calculateNGC()` now returns deterministic output — no rolling normalization, no VTS coupling
- `calculateExtendedSignalMetrics()` uses deterministic blending formula
- RollingNormalizer class preserved but bypassed for confidence computation
- All export signatures maintained — no breaking changes to consumers
- Signal orchestrator log prefix updated from `[11.0E]` to `[12.3.3]`

### Design Decisions

1. **Function signatures preserved**: `calculateNGC()` and `calculateExtendedSignalMetrics()` still exist with the same signatures. Consumers do not need modification.
2. **RollingNormalizer kept**: The class is preserved in code but no longer influences confidence output. Full removal deferred to MCE when the entire quality_index.ts file is replaced.
3. **Deterministic, not ML-driven**: The new formula is a fixed weighted average — no learning, no adaptation, no temporal state. This is intentional: confidence should be transparent and reproducible until MCE provides PredictiveConfidence.
4. **Weight rationale**: Strategy confidence gets 60% weight (primary signal), volatility and risk each get 20% (market context). Extended version adds profitability at 30% (performance feedback).

## Impact

- NGC no longer contaminates the FinalScore pipeline with opaque legacy computation
- Confidence values are now deterministic and reproducible (backtesting = forward testing)
- VTS learning parameters no longer influence scoring (architectural coupling removed)
- Quality index file remains ~830 lines (no size change — internals replaced, not removed)

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `server/core/metrics/quality_index.ts` | Modified | NGC replaced with deterministic confidence formula |
| `server/services/signal-orchestrator.ts` | Modified | Log prefix updated to `[12.3.3]` |

---

*Implemented as part of Phase 12.3 Pipeline Unification mega-batch (Batch 13) alongside Directives 12.3.1 and 12.3.2.*
