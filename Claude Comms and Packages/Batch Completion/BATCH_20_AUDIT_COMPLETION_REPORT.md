# Batch 20 — Strategy-Family Filter Profiles Audit
## Batch Completion Report

**Date**: 2026-03-23
**Branch**: dawntrader-v4
**Batch Type**: Pre-Implementation Audit (no code changes)
**Actors**: Claude Code (auditor), Langston (reviewer), Kyle (approver)
**Scope File**: `STRATEGY_FAMILY_FILTER_AUDIT_PLAN_2026-03-23.md`

---

## 1. Audit Objective

Conduct a comprehensive code audit of the DawnTrader V3 filter pipeline, signal generation, and supporting systems to establish a verified factual baseline before implementing Strategy-Family Filter Profiles. The audit needed to answer:

- What is the exact order of operations in the pipeline?
- Are all input units consistent across consumers?
- Where should each type of check live (which layer)?
- Is Architecture A (Early MCE) or B (Brute-Force Fan-Out) preferable?
- What telemetry gaps exist that would blind us during implementation?

---

## 2. Audit Scope (10 Steps Completed)

| Step | Target | Status |
|------|--------|--------|
| 0.5 | screener_filters DB current values | Complete |
| 1 | VTS metrics/telemetry definitions and UI labels | Complete |
| 2 | vts-runner.ts deep dive | Complete |
| 3 | signal-orchestrator.ts deep dive | Complete |
| 4 | Pattern detection and mapping code | Complete |
| 5 | Filter pipeline code (quant + pattern) | Complete |
| 6 | DI calculation code and consumers | Complete |
| 7 | MCE service inputs/outputs | Complete |
| 8 | Family profile and filter data structures | Complete |
| 9 | Duplicate/guard logic | Complete |
| 10 | DB schema (filter_profiles, screener_filters) | Complete |

---

## 3. Artifacts Produced

| # | Artifact | File | Reviewed By |
|---|----------|------|-------------|
| 1 | Pipeline Dependency / Order-of-Operations Map | `AUDIT_ARTIFACT_1_PIPELINE_MAP.md` | Langston (approved) |
| 2 | Input / Units Matrix | `AUDIT_ARTIFACT_2_INPUT_UNITS_MATRIX.md` | Langston (approved) |
| 3 | Layer-Responsibility Matrix | `AUDIT_ARTIFACT_3_LAYER_RESPONSIBILITY.md` | Langston (approved with tightening) |
| 4 | Architecture A vs B Comparison | `AUDIT_ARTIFACT_4_ARCHITECTURE_COMPARISON.md` | Langston (approved with tightening) |
| 5 | Null / Rejection Diagnostics Plan | `AUDIT_ARTIFACT_5_DIAGNOSTICS_PLAN.md` | Langston (approved) |

---

## 4. Confirmed Findings (Audit-Proven Facts)

### F1: No Input Unit Mismatches
All filter consumers, strategy consumers, MCE inputs, SQE inputs, and RTB inputs use consistent units. No percent-vs-decimal, normalized-vs-raw, or ratio-vs-absolute mismatches found across the entire pipeline.

### F2: Early MCE is Technically Feasible
MCE requires only OHLC data, current price, and 24h volume — all available immediately after FX5 scan. No hidden timing dependencies. No database access. Pure computation with 60-second cache TTL. Sub-millisecond per pair. Running on ~200 pairs instead of ~80 adds ~200ms per cycle (30-second cycle has ample headroom).

### F3: Pattern Detection Breadth is Correct
All 5 pattern types (ABCD, flag, morning star, inside bar reversal, support bounce) are attempted for every pair in the pattern pool. Multiple BUY patterns per pair are allowed — no "best pattern" collapsing. Canonical normalization and regime strategy map lookup are correct.

### F4: DI Units Are Consistent (0-100 Everywhere)
All DI consumers — FX5 scanner, pattern IMF filter, UI display, pattern scanning tab, API routes, VTS routes, MCE regime detection — use the identical 0-100 scale. No unit mismatches.

### F5: DI Thresholds Are Potentially Misaligned (NOT Validated)
The audit cleared DI units but **did not validate DI thresholds**. The DI formula changed materially (full-history ER producing 0-12 range → 48-candle window ER producing 15-60 range) while thresholds were inherited unchanged (55 trending, 30 pattern, 35 choppy). Threshold suitability remains **unproven** and requires **empirical recalibration from telemetry**.

- **Pattern path**: Most immediate concern. DI ≥ 30 is now very permissive under the new distribution.
- **Quant path**: DI ≥ 55 catches only the top of the new distribution — may be overly restrictive.
- **Family-aware paths**: DI may need family-specific or inverted use (DI_MAX for reversal/oscillator families that prefer choppy conditions) rather than one universal minimum.

### F6: Duplicate Handling is Correct (pair+strategy identity)
VTS uses pair+strategy dedup with `VTS_MAX_CONCURRENT_PER_COMBO = 1`. RTB has additional pair-level guard at promotion time. Multi-family survival is safe — a pair surviving multiple family paths will generate separate signals with different strategies, and existing dedup handles this correctly.

### F7: DB-Driven Filter Architecture Supports Family Extension
The `screener_filters` table uses `(mode, filterPath)` composite key with 8 existing rows. Adding family-specific rows (e.g., `active_trend`, `active_reversal`, `vts_breakout`) requires no schema changes — just INSERT new rows with family-specific thresholds.

### F8: Two Hybrid Confluence Mechanisms Exist with Different Formulas
- **Intra-cycle**: `detectConfluence()` in signal-orchestrator uses time-window matching
- **Cross-cycle**: `hybridConfluenceBuffer` with 5-minute TTL and linear decay factor
- These use **different confidence computation formulas**, creating potential inconsistency
- Not blocking for family-filter implementation but should be unified eventually

### F9: Telemetry Gap in Null Reason Categorization
`quantStrategyNulls` counter lumps all null reasons into a single number. The detailed reject reasons ARE logged via `logSkippedSignal()` (10 distinct reason codes) but are NOT surfaced in the dashboard evaluation counters. Additionally, `totalStrategyEvaluations` (sum of all detect() calls) is not tracked, making it impossible to compute accurate strategy success rates.

### F10: VN Veto is Redundant with IMF Filter
Both the VN veto (pre-MCE gate) and the quant IMF filter check `VN ≤ 0.93`. The veto is harmless but redundant. Could be consolidated.

---

## 5. Architecture Decision

### **Architecture B (Brute-Force Fan-Out) is the practical front-runner.**

**Rationale:**
1. Lower implementation cost — extends existing DB-driven filter architecture
2. Multi-family survival is valuable — versatile pairs get evaluated by more strategies
3. No new classifier component — avoids a new failure point
4. Deterministic behavior — threshold comparisons have no classification error
5. Natural extensibility — new asset types just need new filter rows
6. Existing pair+strategy dedup handles multi-path survival correctly
7. Compute is negligible — ~10ms for 1000 filter checks

**Architecture A (Early MCE) remains a viable alternative.** The audit confirmed early MCE is technically feasible. Architecture A may prove superior if regime-based classification adds meaningful value to family assignment — the audit did not test this hypothesis, so it remains an open question.

---

## 6. Decisions Made During This Batch

| Decision | Made By | Rationale |
|----------|---------|-----------|
| Architecture B over A | All 3 actors | Practical, lower risk, extends existing patterns |
| DI threshold reevaluation required | Kyle + Langston + Claude Code | Formula changed, thresholds inherited, distribution shifted |
| Threshold values are CANDIDATES not finals | Langston (tightening review) | Need empirical calibration from telemetry |
| Dual-path tagging is an OPEN DESIGN question | Langston (tightening review) | Multi-family survival behavior needs explicit design |
| Telemetry baseline capture before implementation | All 3 actors | Cannot measure improvement without before-state |
| Audit batch separate from implementation batch | Kyle | Clean governance separation |
| Implementation may be multiple batches | Langston | If audit finds distinct workstreams, scope separately |

---

## 7. Implementation Batch Scope (Recommended)

Based on audit findings, the next batch(es) should address:

### Must-Have (Implementation Batch)
1. Add family-specific filter_path rows to screener_filters DB
2. FX5 scanner runs all family paths in parallel on global survivors
3. Tag survivors with `familyPaths: string[]`
4. Signal orchestrator uses familyPaths for strategy family selection
5. Update Guardrails & Filters UI to show family columns
6. DI threshold calibration workstream (governed 5-step process — see below)
7. Add `di_max` column to screener_filters (reversal/oscillator need upper bound, not lower)
8. Telemetry baseline capture (before-state)

### Should-Have (Same or Next Batch)
9. Expand VTSEvalSnapshot with null reason breakdown
10. Add totalStrategyEvaluations counter
11. Per-family-path metrics in dashboard
12. Rename `tradesSimulated` → `signalsGenerated`

### DI Threshold Calibration Methodology (Consensus — All 3 Actors)

> Signal volume is currently too sparse for pure outcome-based calibration. The methodology must use a widened evidence stack, not just live trade outcomes.

1. **Theory anchors**: DI is an Efficiency Ratio with known mathematical properties. Set directional expectations and hard guardrails per family (trend wants high DI, reversal wants low DI).
2. **Current distribution readout**: Run FX5 scan, log DI for all 300 pairs under the new 48-candle formula. Understand where the population actually sits. **Can start immediately.**
3. **Skipped-signal / near-miss analysis**: Query existing skipped signals logs — every rejected signal has DI value, strategy, regime, and reject reason. Analyze DI bands vs reject reasons and downstream quality. **Data already exists.**
4. **Controlled VTS what-if replay**: Replay wider candidate populations with alternate DI thresholds, compare signal quality / false-positive load. **May require additional implementation.**
5. **Provisional conservative thresholds**: Set initial thresholds based on steps 1-3, with later revalidation after more evidence accumulates. Do NOT lower the bar just to admit more names — thresholds must be tied to trade quality, not survivor count.

**Key principle (Kyle)**: A broad low-quality distribution could make percentile-based thresholds dangerous. The metric must be outcome-linked, not distribution-normalized.

### Nice-to-Have (Future)
13. Unify hybrid confluence formulas
14. Consolidate VN veto with IMF filter
15. Add regime-aware family threshold overrides

---

## 8. Open Questions for Implementation

1. **DI inversion schema**: Current DB has `di_min` only. Reversal/oscillator families need `di_max`. Add new column or use convention (negative value = max)?
2. **Hybrid family inheritance**: Do hybrid strategies inherit from component families or have their own path?
3. **VTS relaxation ratios**: Should VTS family paths use same relaxation pattern as current VTS quant/pattern?
4. **Family assignment for existing strategies**: Some strategies (e.g., `breakout`) appear in both Trend and Breakout families. Canonical assignment needed.

---

## 9. Test Impact

No code changes in this batch — no test impact. Implementation batch will need:
- New unit tests for family-specific filter paths
- Integration tests for multi-family survival scenarios
- Telemetry validation tests

---

## 10. Governance Notes

- **Scope file**: `STRATEGY_FAMILY_FILTER_AUDIT_PLAN_2026-03-23.md`
- **Artifacts**: 5 files in `Claude Comms and Packages/Scope Files/`
- **3-way discussion**: Telegram Topic #21 (Batch Implementations), messages ~1340-1370
- **Review**: Langston completed artifact review with 3 tightening requests (all applied)
- **Approval**: Kyle approved audit plan and findings direction
