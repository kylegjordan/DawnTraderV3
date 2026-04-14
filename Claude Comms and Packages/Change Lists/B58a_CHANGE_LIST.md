# Batch 58a Change List — Phase 11 Finalization (Governance + Baseline)

> **Date:** 2026-04-11
> **Type:** Governance-only batch (no code commits, no trading logic changes)
> **Purpose:** Complete Directive 11.8B-E (Adjustment Framework) and 11.8C (Authority Baseline)
> **Review Requested:** Langston file-by-file review before Kyle shares with prior session

---

## Files Created (3)

### 1. `1-system-manual/ADJUSTMENT_FRAMEWORK.md` (NEW)

**Purpose:** The "decision constitution" — defines what may be adjusted, by whom, under what evidence, with what bounds.

**Contents:**
- Section 1: Governance Principles — 5 constitutional axioms (DB authority, one framework, evidence before action, bounded/reversible, no feedback loops)
- Section 2: Three Governance Tiers
  - **Tier 1 (Evidence-Adjustable):** Per-family IMF thresholds, pattern path thresholds, volume gate soft-factor weights, strategy params, MIN_FINAL_SCORE, VTS_NET_EV_FLOOR
  - **Tier 2 (Supervised-Only):** rankingScore weights, regime-strategy nuances, VTS behavior knobs, directional bias influence, HYBRID_PARAMS
  - **Tier 3 (Constitutional/Locked):** 5-regime model, canonical map structure, rankingScore architecture, FinalScore architecture, DB-as-authority, Net Expectancy Kernel, EXECUTION_CONFIG (frozen), asset-class profile architecture
- Section 3: Parameter Hierarchy — Global > Asset-Class > Path > Family > Strategy. Inheritance rule: child may only operate within parent's delegated envelope.
- Section 4: Evidence-Gating Framework — three modes (VTS/Paper/Live), precedence Live>Paper>VTS, per-parameter-class evidence thresholds table, directional bias governance
- Section 5: Per-Parameter Specification — 7 fields per parameter (value, bounds, step size, cadence, evidence, reversion, audit). Full specs for vn_max, di_min, lq_min, min_volume, MIN_FINAL_SCORE, VTS_NET_EV_FLOOR, volume gate multipliers, ATR target multipliers, rankingScore weights, FinalScore gap rule.
- Section 6: Safety Guarantees — reversion protocol, max adjustment magnitude (3 filter / 2 strategy / 1 scoring simultaneously), mandatory reversion triggers (signal rate -30%, win rate -15%, negative EV, null rate +25%)
- Section 7: Retroactive Baseline Acknowledgment — B55-B57 changes validated and included in V1.0
- Section 8: Phase 11 Closure statement

**Review focus:** Are the tier classifications correct? Are the per-parameter bounds reasonable? Are the evidence thresholds appropriate?

---

### 2. `1-system-manual/AUTHORITY_BASELINE.md` (NEW)

**Purpose:** V1.0 known-good snapshot — the rollback target if performance degrades.

**Contents:**
- Section A: Database Thresholds — all 24 screener_filters rows (12 paths x 2 modes). Uniform values (lq_min=43, corr_max=0.92, final_score_min=0.35, etc.) and differentiating values (vn_max, di_min, di_max, min_volume per path).
- Section B: Strategy Constants — all 17 strategies with hardcoded parameters from code files. Includes volume gate classification (soft/hard/mixed/none). Full parameter lists per strategy.
- Section C: Shared Configuration — SCORE_WEIGHTS (0.4/0.3/0.2/0.1), RANKING_WEIGHTS (3 profiles + gap safety rule), HYBRID_PARAMS, Scanner params (BATCH_SIZE=300, pool ratios), EV Gate params, VTS_NET_EV_FLOOR (-0.01), EXECUTION_CONFIG (frozen, 9 params), 5-regime model.
- Rollback procedure (5 steps)
- Versioning policy

**Review focus:** Are all parameter values correct? Is anything missing? Are strategy params accurately captured from the code files?

---

### 3. `1-system-manual/authority-baseline-v1.json` (NEW)

**Purpose:** Machine-readable version of the Authority Baseline for future code consumption.

**Structure:**
```
{
  "version": "1.0",
  "db_thresholds": { "screener_filters": { "uniform": {...}, "differentiating": {...} } },
  "strategy_constants": { 17 strategies with file, family, volumeGate, params },
  "shared_config": { score_weights, ranking_weights, hybrid_params, scanner, ev_gate, vts, execution_config, regime_model }
}
```

**Review focus:** Does the JSON structure accurately mirror the markdown baseline? Are the numeric values correct?

---

## Files Modified (2)

### 4. `1-system-manual/BATCH_CATALOG.md` (MODIFIED)

**Change:** Added Batch 58a entry after Batch 57.

**Entry text:** Phase 11 Finalization — created ADJUSTMENT_FRAMEWORK.md, AUTHORITY_BASELINE.md, authority-baseline-v1.json. Pre-audit: 26 components, 150+ params, DB snapshot. Langston consensus #723-730.

---

### 5. `1-system-manual/PHASE_HISTORY.md` (MODIFIED)

**Change:** Updated "Current Historical Position" section — added Batch 58a entry, updated "Next" to point to B58b.

---

## Files Created Earlier This Session (scope/audit — not governance)

### 6. `Claude Comms and Packages/Scope Files/BATCH_58_SCOPE.md` (NEW)

5-objective scope document. Approved by Langston with 7 refinements (all incorporated). Split into B58a (governance) + B58b (code).

### 7. `Claude Comms and Packages/Scope Files/BATCH_58_PRE_AUDIT.md` (NEW)

Pre-implementation audit: 26 system components flagged, 150+ params cataloged, DB snapshot (24 screener_filters rows), EXECUTION_CONFIG and VTS_NET_EV_FLOOR captured, boot orchestrator circular dependency warning.

---

## What This Batch Does NOT Do

- No code changes (no .ts/.tsx files modified)
- No trading logic changes
- No threshold value changes — current values become the baseline as-is
- No strategy constant migration from code to DB
- No validation enforcement (that's B58b)
- Phase 11 not marked COMPLETE yet (requires B58b implementation)

---

## Langston Review Checklist

- [ ] ADJUSTMENT_FRAMEWORK.md — tier classifications correct
- [ ] ADJUSTMENT_FRAMEWORK.md — per-parameter bounds reasonable
- [ ] ADJUSTMENT_FRAMEWORK.md — evidence thresholds appropriate
- [ ] ADJUSTMENT_FRAMEWORK.md — safety guarantees sufficient
- [ ] AUTHORITY_BASELINE.md — Section A (DB thresholds) values verified against live DB
- [ ] AUTHORITY_BASELINE.md — Section B (strategy constants) values verified against code files
- [ ] AUTHORITY_BASELINE.md — Section C (shared config) complete and accurate
- [ ] authority-baseline-v1.json — structure mirrors markdown, values correct
- [ ] BATCH_CATALOG.md — B58a entry accurate
- [ ] PHASE_HISTORY.md — update accurate
- [ ] No missing parameters or categories
- [ ] No incorrect tier assignments

---

## Design Decisions (Langston Consensus #723-730)

1. Per-family bounds, not global
2. rankingScore quasi-constitutional (lock structure, narrow supervised weight recal only)
3. Evidence-source agnostic with three-mode hierarchy (Live > Paper > VTS)
4. Asset-class extensible (crypto = first profile)
5. Directional bias = bounded Tier 2 context input
6. One authority framework, mode-specific application
7. B58a = snapshot/classify/document/baseline ONLY — no migration
8. Three-section baseline (db_thresholds, strategy_constants, shared_config)
9. B58b startup validation = structural + bounds sanity, not behavior reinterpretation
10. Log-only validation before blocking mode
