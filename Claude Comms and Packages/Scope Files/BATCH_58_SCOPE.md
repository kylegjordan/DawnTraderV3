# Batch 58 Scope — Phase 11 Finalization: Adjustment Framework (11.8B-E) + Authority Baseline (11.8C)

> **Date:** 2026-04-11
> **Directive:** Phase 11 Finalization — close out remaining 11.8B-E and 11.8C sub-phases
> **Branch:** migration/aws-supabase
> **Scope:** GOVERNANCE + CODE — split into two sub-batches: **B58a** (governance docs + authority baseline snapshot) and **B58b** (code implementation + API integration). Governance framework must be reviewed and locked before code is written against it.
> **Risk:** MEDIUM — introduces new governance framework and parameter registry. No intentional trading-logic or threshold changes, but validation layers must be verified not to block legitimate configuration flows. `/api/filters-v2` validation starts as log-only (warn, don't block) until verified.
> **Langston Input:** Messages #723-727 (2026-04-11). Full consensus on three-tier governance, per-family bounds, evidence-source agnostic design, asset-class extensibility, and three-mode evidence hierarchy. Scope approved with 7 refinements (incorporated below).
> **Prior Session Feedback:** Scope splitting recommended (B58a governance + B58b code). Strategy parameter catalog effort flagged (~100+ params across 17 strategies). Log-only validation before blocking mode. B55-B57 retroactive baseline acknowledgment.
> **Phase 11 Status:** All directives 11.0-11.8D1 complete. Only 11.8B-E (Adjustment Framework) and 11.8C (Authority Baseline) remain. Completing these CLOSES Phase 11 — but only if ALL sub-directives 11.0-11.8E are verified as COMPLETE with evidence in PHASE_HISTORY.md, registry exists, baseline exists, governance docs are coherent, and implementation is actually in place. Do not close on optimism.

---

## Context: Why Phase 11 Must Be Reframed

Phase 11 was last actively worked on in early February 2026 (Directive 11.8A-D1). Since then, 40+ batches have fundamentally changed the system's architecture:

| Dimension | Phase 11 Assumed (Feb 2026) | System Now (Apr 2026, post-B57) |
|-----------|---------------------------|--------------------------------|
| Filter paths | Single global IMF path | Dual-path: quant + pattern |
| Family model | Generic "quant" | 4 quant families (trend, reversal, breakout, oscillation) + pattern path |
| Thresholds | Hardcoded in System Guards / config files | 100% DB-driven (screener_filters), zero hardcoded defaults |
| Ranking | FinalScore for everything | rankingScore for cross-family ordering, FinalScore for quality floor |
| Regimes | 10-regime model (R1-R10) | 5 canonical regimes |
| Strategy routing | Generic pattern consumer | Canonical pattern routing via canonicalPatternType + STRATEGY_PATTERN_MAP |
| Volume gates | Uniform hard gates | Per-strategy-class: soft (reversals) vs hard (breakouts) |
| Strategies | ~10 active | 17 calibrated, regime-gated strategies |
| Diagnostics | Limited | VTS pool-split null reasons, Filter Diagnostics UI, full pipeline transparency |

**The Adjustment Framework and Authority Baseline must be written for the system we have now, not the one we had in February.**

### Retroactive Baseline Acknowledgment

Batches 55-57 made threshold and architectural changes using an informal but sound process: investigate diagnostics → Langston consensus → implement → monitor. These changes include:
- Volume soft gates (support_bounce, reverse_impulse, morning_star, volatility_edge A-point)
- Support_bounce cluster tolerance 0.5% → 0.7%
- Pattern-strategy canonical routing (STRATEGY_PATTERN_MAP)
- Adaptive-flow THREE_SOLDIERS/MORNING_STAR canonicalization

All B55-B57 changes become part of the V1.0 Authority Baseline as-is. The framework retroactively validates the approach used (evidence-driven, consensus-gated, monitored) and formalizes it going forward.

---

## Sub-Batch Structure

**B58a — Governance + Baseline (Objectives 1-3, 5)**
- Create ADJUSTMENT_FRAMEWORK.md (three-tier governance, parameter hierarchy, per-parameter specs)
- Create evidence-gating framework documentation
- Capture Authority Baseline snapshot (V1.0 known-good state)
- Catalog all adjustable parameters from DB + strategy files (~100+ params)
- Governance doc updates
- **Gate:** Langston reviews governance docs before B58b begins

**B58b — Code Implementation (Objective 4)**
- Parameter registry code (`adjustment-registry.ts`)
- Authority baseline loader (`authority-baseline.ts`)
- Audit logging infrastructure
- `/api/filters-v2` validation integration (**log-only first**, then blocking after verification)
- Asset-class profile extensibility scaffolding
- Phase 11 closure (only after all deliverables verified)

---

## Objective 1: Governance Tier Classification Document

Create `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — the "decision constitution" that defines what may be adjusted, by whom, under what evidence, with what bounds.

### 1.1 Three Governance Tiers

**Tier 1 — Evidence-Adjustable** (autonomous or semi-autonomous adjustment under evidence):
- Per-family IMF thresholds (LQ, VolNoise, DI, Correlation) — 8 DB rows in screener_filters
- Pattern path filter thresholds (separate DB profile)
- Volume gate soft-factor weights (support_bounce, reverse_impulse, morning_star, volatility_edge A-point)
- Selected strategy-specific parameters (ATR multipliers, pattern tolerances like cluster width)
- MIN_FINAL_SCORE quality floor
- VTS simulation tuning (NET_EV_FLOOR)

**Tier 2 — Supervised-Only** (can change, but requires explicit human review or cross-agent consensus):
- rankingScore formula weights (cross-family desirability coefficients)
- Regime-strategy weighting nuances within the canonical map
- VTS knobs that materially change learning behavior (cycle timing, batch composition)
- Directional bias weighting influence on strategy selection

**Tier 3 — Constitutional / Locked** (baseline authority, not adjustment targets):
- 5-regime model definition and regime detection logic
- Canonical regime-strategy map structure (which strategies map to which regimes)
- rankingScore formula architecture (the formula shape, not the weights)
- DB-as-authority principle (no hardcoded threshold fallbacks)
- Net Expectancy Kernel formula
- FinalScore formula architecture and role (quality gate, not ranking lever). Note: specific numeric coefficients are constitutional only if code enforces them as immutable — verify before locking exact numbers vs locking the formula shape.
- Asset-class profile architecture

### 1.2 Parameter Hierarchy

```
Global Constitutional Guardrails (Tier 3)
  --> Asset-Class Profile (crypto = first instance; extensible for XStocks, Futures)
    --> Path-Level Thresholds (quant path / pattern path)
      --> Family-Level Thresholds (trend / reversal / breakout / oscillation)
        --> Strategy-Specific Overrides (per-strategy parameters)
```

Each level may only operate **within the envelope delegated by its parent authority**. This avoids making crypto's current numerical assumptions the default ceiling for future asset classes — a new asset-class profile receives its own delegated envelope from the global constitutional level.

### 1.3 Per-Parameter Specification

For every Tier 1 and Tier 2 parameter, the framework must define:
- **Current value** (from DB or config)
- **Adjustment bounds** (min/max range the parameter may move within)
- **Adjustment step size** (maximum single-change magnitude)
- **Cadence limit** (minimum time between adjustments to prevent jitter — shorter for Tier 1 diagnostic parameters during active development, longer for execution-facing parameters)
- **Evidence requirements** (what data must exist before adjustment is permitted)
- **Reversion trigger** (conditions under which adjustment auto-reverts to baseline)
- **Audit trail requirement** (how the change is logged)

### Verification Criteria
- [ ] ADJUSTMENT_FRAMEWORK.md exists in `1-system-manual/` and Google Drive
- [ ] Every Tier 1 parameter has all 7 specification fields defined
- [ ] Every Tier 2 parameter has governance rules defined
- [ ] Every Tier 3 item is explicitly marked as locked with rationale
- [ ] Parameter hierarchy is documented with inheritance rules

---

## Objective 2: Evidence-Gating Framework

### 2.1 Three Evidence Modes

The framework is **evidence-source agnostic**. Evidence quality depends on the operating mode, not the source name:

| Mode | Trust Level | Valid For | Adjustment Aggressiveness |
|------|------------|-----------|--------------------------|
| **VTS / Passive Learning** | Lowest | Diagnostics, simulation tuning, filter-behavior analysis, provisional recommendations | Broadest exploratory adjustment within bounded rails |
| **Active Paper Trading** | Medium | End-to-end behavior validation, supervised operational tuning | Moderate — supervised, evidence-gated |
| **Live Trading** | Highest | Execution-facing parameter decisions, profitability validation | Strictest — narrowest bounds, staged rollout, review required |

**Evidence precedence: Live > Paper > VTS**

The currently dominant operating mode determines which evidence source satisfies requirements. Today that is VTS. When active paper trading goes live, paper evidence takes precedence for execution-facing decisions. VTS remains valid for diagnostic and calibration purposes in all modes.

### 2.2 Generic Evidence Thresholds

For any Tier 1 adjustment, ALL THREE must be satisfied:

1. **Minimum time window** — rolling window of sufficient duration (e.g., 7 days minimum for first-order threshold changes)
2. **Minimum evaluation volume** — enough evaluations from the currently authoritative mode per family/path to avoid small-sample tuning
3. **Minimum realized-outcome evidence** — for execution-facing parameters, enough closed-trade evidence demonstrating quality impact

**Critical distinction:**
- **Diagnostic/filter parameters** (e.g., IMF thresholds, volume gate weights) can move on evaluation evidence alone
- **Execution-facing parameters** (e.g., MIN_FINAL_SCORE, strategy entry thresholds) require stronger realized-outcome evidence from the highest-trust available mode

This prevents one generic evidence rule from being misused to loosen execution-facing parameters on diagnostic data alone.

Specific numeric thresholds defined per-parameter in Objective 1.3.

### 2.3 Directional Bias as Bounded Context

Directional bias (pair-level + global) is recognized as a context dimension that informs filter/strategy evaluation. It is classified as a **Tier 2 supervised adjustment input** with:
- Narrow bounds on weighting influence
- Evidence-gating before weight changes
- No autonomous feedback loops (system cannot over-trust its own market stance)

### Verification Criteria
- [ ] Evidence mode hierarchy documented (Live > Paper > VTS)
- [ ] Generic evidence thresholds defined (time window, volume, outcome)
- [ ] Mode-specific application rules documented
- [ ] Directional bias governance defined as bounded Tier 2 input

---

## Objective 3: Authority Baseline Snapshot (11.8C)

Create the authoritative "Version 1.0" snapshot — the known-good state that all future adjustments are measured against.

### 3.1 Baseline Contents

The Authority Baseline captures the current state of every adjustable parameter as of the deployment date:

**Filter Thresholds (from screener_filters DB):**
- All 8 family filter rows (active_trend, active_reversal, active_breakout, active_oscillation, vts_trend, vts_reversal, vts_breakout, pattern) with current LQ, VolNoise, DI, Correlation, min_price values

**Strategy Parameters:**
- All 17 strategy configurations in their current calibrated state — **normalized into the baseline registry** (strategy params are currently scattered across constants and individual strategy files; baseline capture requires collecting and normalizing them, not assuming a neat registry already exists)
- ATR multipliers, pattern tolerances, volume gate classifications (soft/hard)
- Strategy-regime mappings from canonical-regime-strategy-map.ts

**Ranking & Scoring:**
- rankingScore formula and current weights
- FinalScore formula coefficients (locked — documented for reference)
- MIN_FINAL_SCORE current value

**Regime Model:**
- 5 canonical regimes with detection criteria
- Regime-strategy affinity map

**Volume Gate Classification:**
- Per-strategy soft vs hard designation
- Soft-factor weight values (support_bounce, reverse_impulse, morning_star, volatility_edge A-point)

**VTS Configuration:**
- NET_EV_FLOOR current value
- Cycle timing, batch composition parameters

### 3.2 Baseline Storage

- **Primary (canonical):** `1-system-manual/authority-baseline-v1.json` — machine-readable baseline, committed to repo
- **Runtime copy (optional):** DB table `authority_baseline` if runtime comparison is needed — but `1-system-manual/` is the single canonical home
- **Governance doc:** Snapshot summary in `1-system-manual/AUTHORITY_BASELINE.md`

### 3.3 Rollback Capability

The baseline serves as the "known-good" checkpoint. If any adjustment degrades system performance:
1. Compare current parameter state against baseline
2. Identify divergent parameters
3. Revert to baseline values
4. Log the reversion with reason

### Verification Criteria
- [ ] All screener_filters rows captured in baseline snapshot
- [ ] All 17 strategy parameters captured
- [ ] rankingScore, FinalScore, regime model captured
- [ ] Volume gate classifications captured
- [ ] Baseline stored in both DB/JSON and governance doc
- [ ] Rollback procedure documented

---

## Objective 4: Parameter Registry (Code Implementation)

### 4.1 Adjustable Parameter Registry

Create a code-level registry that:
- Enumerates every Tier 1 and Tier 2 parameter with its metadata
- Stores bounds, step sizes, cadence limits per parameter
- Validates any proposed adjustment against bounds before applying
- Logs all adjustments with timestamp, old value, new value, evidence reference, mode

### 4.2 Asset-Class Profile Architecture

Design the parameter hierarchy to be asset-class extensible:
- Crypto is the first (and currently only) asset-class profile
- Profile contains: path definitions, family definitions, threshold ranges, volume semantics, correlation norms, directional-bias semantics
- When XStocks or Perpetual Futures are added (Phase 21.5), a new profile is instantiated — the framework itself does not need to be rebuilt

### 4.3 Implementation Approach

- New file: `server/config/adjustment-registry.ts` — parameter definitions, bounds, validation
- New file: `server/config/authority-baseline.ts` — baseline snapshot loader and comparator
- Integration: adjustment validation called before any DB threshold write via `/api/filters-v2` — **Phase 1: log-only mode** (warn but don't block), **Phase 2: blocking mode** (after verification that no legitimate flows are interrupted)
- Audit logging: adjustment events written to a new `adjustment_audit_log` DB table or append-only log

### Verification Criteria
- [ ] Parameter registry file created with all Tier 1 + Tier 2 parameters
- [ ] Bounds validation prevents out-of-range adjustments
- [ ] Audit logging captures all adjustment events
- [ ] Asset-class profile structure supports future extension
- [ ] `/api/filters-v2` writes pass through registry validation

---

## Objective 5: Governance Documentation

### 5.1 Documents to Create
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — the decision constitution (Objective 1)
- `1-system-manual/AUTHORITY_BASELINE.md` — baseline snapshot and rollback procedures (Objective 3)
- `1-system-manual/authority-baseline-v1.json` — machine-readable baseline

### 5.2 Documents to Update
- `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` — Phase 11 status → COMPLETE
- `1-system-manual/POST_AUDIT_ROADMAP.md` — Phase 11 → COMPLETE, update "Where We Are"
- `1-system-manual/PHASE_HISTORY.md` — B58 entry
- `1-system-manual/BATCH_CATALOG.md` — B58 entry
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new components (parameter registry, authority baseline)
- `1-system-manual/CHANGES_AND_FIXES.md` — if applicable
- `bridge/canonical/phase11_implementation_history.md` — update to mark 11.8B-E and 11.8C complete (legacy location, kept for historical continuity)

### 5.3 Batch Completion Report
- `Claude Comms and Packages/Reports/Batch Completion/BATCH_58_COMPLETION_REPORT.md`

### Verification Criteria
- [ ] All new governance docs exist in repo AND Google Drive
- [ ] All updated docs reflect Phase 11 COMPLETE
- [ ] Batch completion report lists all governance files changed
- [ ] Langston reviews and confirms

---

## Summary of Deliverables

| # | Deliverable | Type | Sub-Batch |
|---|------------|------|-----------|
| 1 | `ADJUSTMENT_FRAMEWORK.md` — three-tier governance, parameter hierarchy, per-parameter specs | Governance | B58a |
| 2 | Evidence-gating framework — three modes, generic thresholds, directional bias rules | Governance | B58a |
| 3 | `AUTHORITY_BASELINE.md` + `authority-baseline-v1.json` (both in `1-system-manual/`) — V1.0 known-good snapshot | Governance + Data | B58a |
| 4 | `adjustment-registry.ts` + `authority-baseline.ts` — parameter registry, bounds validation, audit logging | Code | B58b |
| 5 | All Tier 1+2 governance updates + completion report | Governance | B58b (final) |

## Risk Assessment
- **No trading logic changes** — this batch defines the rules for future changes, not the changes themselves
- **No threshold modifications** — current values become the baseline as-is
- **New code is validation/logging** — no intentional trading-logic or threshold changes, but must be verified not to block legitimate configuration flows (validation layers can block writes if wired badly)
- **Asset-class extensibility** is architectural scaffolding, not implementation of new asset classes

## Dependencies
- Langston scope review and approval before implementation
- Kyle approval of governance tier classifications
- **Pre-implementation audit** of current DB state (screener_filters rows, strategy configs) to populate baseline. **MANDATORY: Review SYSTEM_IMPACT_MAP.md for all components affected** — understand upstream/downstream impacts of registry validation integration, API changes, and new governance enforcement points.
- B58a governance docs reviewed and locked before B58b code implementation begins

## Phase 11 Closure Checklist

Phase 11 may only be marked COMPLETE when ALL of the following are verified with evidence in PHASE_HISTORY.md:

- [ ] 11.0 Metric Engine Consolidation — COMPLETE (FinalScore canonical, legacy metrics deprecated)
- [ ] 11.1 Canonical Regime-Strategy Mapping — COMPLETE (canonical-regime-strategy-map.ts)
- [ ] 11.2 VTS Modernization — COMPLETE (Phase-10 aligned, regime-driven)
- [ ] 11.3 Adaptive Scanning Intelligence — COMPLETE (dual-pool, telemetry aggregator)
- [ ] 11.4 Market Indicators & Analytics Hardening — COMPLETE (IMF integration, pattern detection)
- [ ] 11.5 Math, Macro, and Regime Synchronization — COMPLETE (profitability gate, z-score, macro-state)
- [ ] 11.6 Data Purge & ML Reset — COMPLETE (contaminated data purged)
- [ ] 11.7 Regime Archive & Telemetry — COMPLETE (archival scheduler, canonical lock-in)
- [ ] 11.8A Authority Audit — COMPLETE (4 canonical authority sources identified)
- [ ] 11.8B Decommission Execution — COMPLETE (LATTi, Goals ML, Presets removed)
- [ ] 11.8B-E Adjustment Framework — **THIS BATCH** (governance tiers, parameter specs, evidence-gating)
- [ ] 11.8C Authority Baseline — **THIS BATCH** (V1.0 snapshot, rollback capability)
- [ ] 11.8D1 Filter Authority Cleanup — COMPLETE (/api/filters-v2 sole write path)
- [ ] Registry code exists and validates adjustments
- [ ] Baseline snapshot captured and stored
- [ ] Governance docs coherent and in both repo + Google Drive

---

## Design Decisions Log (from Langston consensus, #723-727)

1. **Per-family bounds, not global** — each family/path solves different problems; global-only drags back to monolithic worldview
2. **rankingScore quasi-constitutional** — lock formula structure, allow only narrow supervised weight recalibration
3. **Evidence-source agnostic** — framework asks "enough trustworthy evidence from current mode?" not "enough VTS evidence?"
4. **Three-mode evidence hierarchy** — Live > Paper > VTS with mode-appropriate aggressiveness
5. **Asset-class extensible** — crypto is first profile, not universal assumption; framework scales forward
6. **Directional bias bounded** — recognized context dimension, supervised Tier 2, not autonomous driver
7. **One authority framework, mode-specific application** — not separate constitutions per mode
