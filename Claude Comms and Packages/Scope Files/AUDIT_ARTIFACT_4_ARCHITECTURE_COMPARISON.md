# Artifact 4 — Architecture A vs B Comparison

**Audit**: Strategy-Family Filter Profiles
**Date**: 2026-03-23
**Status**: Complete

---

## Architecture A: Early MCE → Informed Family Routing

### Flow
```
FX5 Scan (300 pairs) → Global Filters (~200 survivors)
    → MCE on all ~200 survivors (~200 × sub-ms = negligible)
    → Family Classifier (uses MCE regime + indicators to assign family lean)
    → Family-Specific IMF Filters (trend/reversal/breakout/oscillator profiles)
    → Signal Orchestrator (strategies run only for family-appropriate survivors)
```

### Pros
| Advantage | Impact |
|-----------|--------|
| Each pair goes through ONE family IMF path | Targeted filtering, no redundant evaluation |
| MCE data available for classification | Regime-informed family assignment |
| Clean routing: classifier → filter → evaluate | Explainable pipeline |
| No multi-path survival ambiguity | One family assignment per pair |

### Cons
| Disadvantage | Impact | Severity |
|--------------|--------|----------|
| Must move MCE earlier in pipeline | Code refactor required | Medium |
| MCE runs on ~200 pairs instead of ~80 | ~2.5x compute increase | **Low** (sub-ms per pair) |
| MCE outputs must travel through filter stages | Payload/contract expansion | Medium |
| Family classifier is a NEW component | Design + implementation needed | Medium |
| Classifier errors misroute pairs | A trend pair classified as reversal gets wrong filters | Medium |
| Some pairs may genuinely fit multiple families | Forced single-family assignment loses versatility | **High** |

### Compute Analysis
- MCE per pair: < 1ms (pure computation, no I/O)
- 200 pairs × 1ms = ~200ms additional per cycle
- 30-second cycle has ~29.8 seconds of headroom
- **Verdict**: Compute is NOT a blocker

### Contract Cleanliness
- MCE currently returns `MarketContext` with regime + indicators
- Would need to carry `familyLean: string` through filter pipeline
- Filter pipeline currently doesn't pass MCE context — would need refactoring
- **Verdict**: Requires moderate refactoring

---

## Architecture B: Brute-Force All Family Paths (FRONT-RUNNER)

### Flow
```
FX5 Scan (300 pairs) → Global Filters (~200 survivors)
    → Trend IMF Filters → trend survivors (tagged 'trend')
    → Reversal IMF Filters → reversal survivors (tagged 'reversal')
    → Breakout IMF Filters → breakout survivors (tagged 'breakout')
    → Oscillator IMF Filters → oscillator survivors (tagged 'oscillator')
    → Pattern IMF Filters → pattern survivors (tagged 'pattern')
    → Union of all survivors → activeFilterPool (with familyPath tags)
    → MCE stays where it is (signal orchestrator)
    → Strategy evaluation only for family-appropriate strategies
```

### Pros
| Advantage | Impact |
|-----------|--------|
| MCE stays in current position | No pipeline reordering needed |
| No circular dependency | Family classification is implicit (survive the path = belong to family) |
| Multi-family survival is a FEATURE | Versatile pairs get evaluated by multiple strategy families |
| pair+strategy dedup already handles multi-path | Existing logic sufficient |
| IMF filters are CHEAP | ~5 threshold comparisons per pair per path |
| No new classifier component needed | Just additional filter rows in DB |
| Extends naturally to new asset types | Add new family rows, recalibrate thresholds |
| DB-driven architecture already supports this | Just add 2-4 more filter_path rows per mode |

### Cons
| Disadvantage | Impact | Severity |
|--------------|--------|----------|
| Multiplied IMF evaluations | ~200 × 5 paths = ~1000 filter checks | **Low** (threshold checks are trivial) |
| Attribution complexity | Which family "owns" a pair that survives multiple paths? | Medium |
| Telemetry must track per-family-path | Dashboard needs per-family columns | Medium |
| Some pairs may get evaluated by strategies that don't suit them | Waste, but strategy should return null | **Low** |

### Compute Analysis
- IMF filter per pair per path: < 0.01ms (5 threshold comparisons)
- 200 pairs × 5 paths × 0.01ms = ~10ms total
- **Verdict**: Completely negligible

### Contract Cleanliness
- Filter pipeline already supports `filterPath` discriminator
- Just add new rows: `active_trend`, `active_reversal`, `active_breakout`, `active_oscillator`
- `sourcePool` tagging already exists — extend to include `familyPath`
- **Verdict**: Clean extension of existing architecture

---

## Head-to-Head Comparison

| Criterion | Architecture A | Architecture B | Winner |
|-----------|---------------|----------------|--------|
| **Compute cost** | ~200ms (MCE on all survivors) | ~10ms (filter checks) | **B** |
| **Implementation complexity** | High (new classifier + pipeline reorder) | Low (add DB rows + filter paths) | **B** |
| **Routing clarity** | Clear (one family per pair) | Multi-path possible (needs attribution) | **A** |
| **Parity impact** | Must implement for active + VTS × quant + pattern | Same — add rows for all modes | **Tie** |
| **Duplicate handling** | Not needed (one path per pair) | Already handled (pair+strategy dedup) | **Tie** |
| **Observability** | Simpler (one family label per pair) | Richer (which paths did pair survive?) | **B** |
| **Dead-path risk** | Classifier error = pair in wrong family = starved | Filter too strict = pair filtered from path = no signal | **Tie** |
| **Multi-family versatility** | Lost (forced single assignment) | Preserved (pair evaluated by multiple families) | **B** |
| **Asset-type extensibility** | Classifier needs retraining per asset type | Just add/recalibrate filter rows | **B** |
| **DB schema impact** | Needs new classifier table/logic | Just add filter_path rows (existing schema) | **B** |
| **Risk of misclassification** | Medium (classifier can be wrong) | Low (threshold comparisons are deterministic) | **B** |

---

## Recommendation

### **Architecture B is the practical front-runner.**

**Rationale:**
1. **Lower implementation cost** — extends existing DB-driven filter architecture
2. **Multi-family survival is valuable** — versatile pairs get evaluated by more strategies
3. **No new classifier component** — avoids a new failure point
4. **Deterministic behavior** — threshold-based filtering has no classification error
5. **Natural extensibility** — new asset types just need new filter rows
6. **Kyle confirmed**: pair+strategy dedup already handles multi-path survival
7. **Compute is negligible** — ~10ms for 1000 filter checks

**Architecture A remains a viable alternative.** The audit confirmed that early MCE is technically feasible (no blocking dependencies, sub-ms compute). Architecture A may prove superior if regime-based classification adds meaningful value to family assignment — the audit did not test this hypothesis, so it remains an open question. The recommendation for B is based on practicality, lower risk, and alignment with the existing DB-driven architecture — not on proven inferiority of A.

### Implementation Path for Architecture B

1. Add new `filter_path` rows to `screener_filters` DB:
   - `active_trend`, `active_reversal`, `active_breakout`, `active_oscillator`
   - `vts_trend`, `vts_reversal`, `vts_breakout`, `vts_oscillator`

2. Set family-specific thresholds (from Layer-Responsibility Matrix):
   - Trend: VN ≤ 0.60, DI ≥ 55, LQ ≥ 40
   - Reversal: VN ≤ 0.85, DI ≤ 35, LQ ≥ 25
   - Breakout: VN ≤ 0.68, DI ≥ 45, LQ ≥ 35
   - Oscillator: VN ≤ 0.85, DI ≤ 30, LQ ≥ 25

3. FX5 scanner runs ALL family paths in parallel on global survivors

4. Tag each survivor with `familyPaths: string[]` (which paths it survived)

5. Signal orchestrator uses `familyPaths` to select which strategy families to evaluate

6. Update Guardrails & Filters UI to show all family columns

---

## Open Questions for Implementation

1. **DI inversion for reversal/oscillator**: Current DB schema has `di_min` but reversal/oscillator need `di_max`. Schema change needed?
2. **Hybrid family**: Do hybrid strategies inherit from their component families or have their own path?
3. **VTS relaxation ratios**: Should VTS family paths use same relaxation pattern as current VTS quant/pattern?
4. **Telemetry per family**: How granular should per-family-path metrics be?
