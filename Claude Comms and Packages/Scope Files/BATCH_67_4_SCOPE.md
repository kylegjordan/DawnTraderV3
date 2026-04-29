# BATCH 67.4 — Cheap-Tier Bundle: Realized-Outcome Feedback + Regime-Age First-Class + Path B Sustainability

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-04-29
**Status:** Step 1 — scope drafted, awaiting Langston review
**Parent batch:** B67 coordinated regime-confidence overhaul
**Predecessor:** B67.3.5 Pre-Window Hardening (PM2 #114, commits `49209eb4` + `d97d47d7`)
**Successor:** Calibration window starts when this batch deploys clean
**Window dependency:** This is the LAST batch before the 14-day calibration window can start (master plan §0.11.C step 3).

---

## Scope summary

Per master plan §0.11.B: three small complementary levers shipping in **one commit** but retaining **separate sub-deliverable identifiers** for ablation tracking. They share the per-pair regime tracking surface, hence the bundle.

**Three levers:**

| ID | Name | What it does |
|---|---|---|
| **B67.4** | Realized-outcome feedback | Recent (regime, strategy) trade outcomes → adjust confidence on next entry in same tuple. Alpha-weighted moving average of net P&L. |
| **B68.4** | Regime-age first-class metric | Promotes `regimePhaseStore` age data to a confidence-modulating factor with its own ablation row. Currently only used for phase classification (EARLY/PRIME/LATE); now also as an explicit "freshness fingerprint" multiplier. |
| **B68.5** | Path B sustainability tightening | Adds a second gate to the TFS branch when triggered by `\|DBS\| ≥ 0.30` alone. Without sustainability check, Path B over-fires on already-exhausted moves. **Open design question:** which gate to implement (Case B / C / D from §0.8 four-case matrix). See §B.5 below. |

**Calibration window starts** when this batch deploys clean AND post-deploy verification confirms all 5 factors (B67.1 + B67.2 + B67.4 + B68.4 + B68.5) emitting ablation rows correctly per master plan §0.11.C step 3.

---

## Numbered Objectives

### A. B67.4 — Realized-outcome feedback

**A.1** New `OutcomeFeedbackStore` singleton (pattern matches `regimePhaseStore` and `external-macro-feed`): tracks recent net P&L per (regime, strategy) tuple as an alpha-weighted moving average. State: `Map<"<regime>_<strategy>", { ema_pnl_pct: number, sample_count: number, last_update: epochMs }>`.

**A.2** EMA update: on every trade close (active or VTS), feed the trade's `netPnlPercent` into the corresponding tuple's EMA via `ema_new = α × pnl_pct + (1 − α) × ema_old`. `α` from `module_constants` (`b67_4_alpha`, seed 0.10 = ~10-trade half-life). `sample_count` increments. `last_update` set to now.

**A.3** Confidence adjustment: at signal evaluation, after B67.1 + B67.2 modulation but before B67.3.5 clamp, apply outcome feedback:
```
ema = OutcomeFeedbackStore.get(regime, strategy)
if ema.sample_count < b67_4_min_samples (seed 5):
   feedback_factor = 1.0  // cold start, no adjustment
else:
   // Map ema_pnl_pct ∈ [−5%, +5%] → factor ∈ [0.85, 1.05]
   feedback_factor = clamp(0.85, 1.05, 1.0 + ema.ema_pnl_pct × b67_4_sensitivity)
confidence_after_feedback = confidence × feedback_factor
```
Seeds: `b67_4_min_samples` (5), `b67_4_sensitivity` (4.0 — so 1% EMA P&L → 0.04 factor delta), `b67_4_factor_min` (0.85), `b67_4_factor_max` (1.05).

**A.4** Persistence: `OutcomeFeedbackStore` persists to `/tmp/b67-4-outcome-feedback.json` (matches `regimePhaseStore` pattern). 24h hard-expiry on entries with stale `last_update`. Loaded on construction; saved on each EMA update.

**A.5** Ablation row: B67.4 emits a `b67_4_outcome_feedback` factor row on every signal evaluation. Shape:
```jsonb
{
  "factor_name": "b67_4_outcome_feedback",
  "factor_value_with": <feedback_factor>,
  "factor_value_without": 1.0,
  "confidence_with_factor": <confidence_after_feedback>,
  "confidence_without_factor": <confidence_before_feedback>,
  "metadata": {
    "regime": "<regime>",
    "strategy": "<strategy>",
    "ema_pnl_pct": <number>,
    "sample_count": <int>,
    "cold_start": <bool>
  }
}
```

**A.6** Hard-fail discipline: missing `module_constants` keys throw with explicit list (matches B67.1/2/3.5 pattern). Cold-start (sample_count < min) emits factor=1.0 + cold_start=true (legitimate runtime state, not silent fallback).

**A.7** No active gating yet. B67.4 modulates `regime_confidence` which is still decorative pre-B67.5. Behavior change: `regime_confidence_modulated` column on trade records reflects B67.1 × B67.2 × B67.4 × phase weight, all clamped at the end.

### B. B68.4 — Regime-age first-class metric

**B.1** Promote `regimePhaseStore` age data from "phase classifier input" (current usage in B67.2) to **also** a standalone confidence-modulating factor with its own ablation row.

**B.2** Computation: `freshness_factor = clamp(0.92, 1.05, 1.0 + (target_age_hours - actual_age_hours) × b68_4_sensitivity / target_age_hours)` where:
- `target_age_hours` = `b68_4_target_age_hours` (seed 6.0 — middle of PRIME band)
- `b68_4_sensitivity` (seed 0.10 — so 6h-old pair gets factor=1.0, 0h pair gets +5%, 12h+ pair gets −8%)
- Clamp range `[0.92, 1.05]` from `b68_4_min` / `b68_4_max`

Rationale: fresh-entry regimes (just transitioned) get a small bonus; aged-out regimes (LATE phase, exhaustion-prone) get a small penalty. Independent of phase weight (which is per-(strategy, phase) lookup); this is a per-pair freshness signal.

**B.3** Apply BEFORE B67.4 outcome feedback. Order in modulation chain:
```
raw_confidence (B67.3.5 desat output)
  × macro_modifier (B67.1)
  × phase_weight (B67.2 per-(strategy, phase) lookup)
  × freshness_factor (B68.4)
  × outcome_feedback_factor (B67.4)
  → clamp [0.4, 1.0]
  → regime_confidence_modulated
```

**B.4** Ablation row: B68.4 emits `b68_4_regime_age` factor row. Shape:
```jsonb
{
  "factor_name": "b68_4_regime_age",
  "factor_value_with": <freshness_factor>,
  "factor_value_without": 1.0,
  "confidence_with_factor": <conf>,
  "confidence_without_factor": <conf / freshness_factor>,
  "metadata": {
    "phase_age_seconds": <number>,
    "phase_age_hours": <number>,
    "target_age_hours": <number>
  }
}
```

**B.5** No new persistence — reads `regimePhaseStore` directly via existing accessor.

**B.6** Hard-fail on missing module_constants. No fallbacks.

### C. B68.5 — Path B sustainability tightening (DESIGN OPEN — see §B.5 below)

**C.1** Add a second gate to the TFS branch in `market-regime.ts` when triggered by `|DBS| ≥ 0.30` alone. Without this gate, Path B fires on already-exhausted moves (B65.6 deferred work — 04-22 hostile day cohort showed strong-bull-trend trades catastrophically underperforming on aged Path-B-triggered TFS).

**C.2** Three options per master plan §0.8 four-case matrix:

| Case | Gate added on top of `\|DBS\| ≥ 0.30` |
|---|---|
| **B** | Multi-TF DBS agreement (5m sign matches 1h sign) — **predicted winner** per §0.10.G but **requires multi-TF DBS infrastructure** (not yet built — would block this batch on B68.1 prerequisite) |
| **C** | DBS slope rising/stable (single-pair time series — no new infrastructure) |
| **D** | A + multi-TF + slope (triple gate) — strictest, may starve signal volume |

**C.3** Recommended for B67.4 cheap-tier bundle: **ship Case C only** (DBS slope rising/stable). Reasons: (a) no new infrastructure needed; (b) Case B + D require multi-TF DBS which is B68.1's domain; (c) §0.8 says "All four cases backtested. Data picks the winner." — backtest is B68.1's job; until then ship the simplest standalone case. Open question for Langston: agree to ship Case C in this bundle, defer Case B/D to B68.1?

**C.4** Case C implementation: compute DBS slope as `(current_dbs - dbs_at_t_minus_30min) / 30`. Promote DBS slope from `directionalBias.slope` (already computed per B62) to the gate decision. Threshold: `b68_5_dbs_slope_min` (seed 0.0 — non-negative slope required to admit Path B).

**C.5** Gate logic in `market-regime.ts` TFS branch:
```typescript
} else if (mom > 0.003 && dx > 50) {
  // Path A — momentum + ADX, unchanged
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // ... existing B67.3.5 desat formula
} else if (absDbs >= 0.30 && dbsSlope >= regimeConfig.b68_5_dbs_slope_min) {
  // Path B — DBS-strength gated by sustainability (B68.5 NEW)
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // ... same B67.3.5 desat formula
} else if (absDbs >= 0.30 && dbsSlope < regimeConfig.b68_5_dbs_slope_min) {
  // Path B rejected — DBS strong but slope negative (aged-out move)
  // Fall through to ST or HVU based on remaining checks
  ...
}
```

**C.6** Threading: `dbsSlope` must be plumbed through MCE → `calculatePairRegime` (5th param OR added to `propagatedDbs` object). Currently `propagatedDbs.slope` already exists per B63 Item 16.

**C.7** Ablation row: B68.5 emits `b68_5_path_b_sustainability` factor row showing the counterfactual — would the regime classification have differed without the slope gate?
```jsonb
{
  "factor_name": "b68_5_path_b_sustainability",
  "factor_value_with": <regime_with_gate>,    // string regime label
  "factor_value_without": <regime_without_gate>,
  "metadata": {
    "dbs_score": <number>,
    "dbs_slope": <number>,
    "path_a_triggered": <bool>,
    "path_b_would_have_triggered_pre_gate": <bool>,
    "path_b_triggered_post_gate": <bool>
  }
}
```

This is a different ablation shape from B67.1/2/3.5/4/B68.4 (those modulate confidence; this modulates the LABEL). Acceptable per §0.10.F — ablation framework is per-factor, each factor defines its own JSONB shape.

**C.8** Hard-fail discipline. Module_constant keys: `b68_5_dbs_slope_min` (seed 0.0).

### D. Module constants (shared across all 3 levers)

Per §0.9 governance rule, all new tunables in `module_constants`:

| Constant | Module | Seed | Purpose |
|---|---|---|---|
| `b67_4_alpha` | `outcome_feedback` | 0.10 | EMA decay, ~10-trade half-life |
| `b67_4_sensitivity` | `outcome_feedback` | 4.0 | 1% EMA P&L → 0.04 factor delta |
| `b67_4_min_samples` | `outcome_feedback` | 5 | Cold-start floor |
| `b67_4_factor_min` | `outcome_feedback` | 0.85 | Lower clamp |
| `b67_4_factor_max` | `outcome_feedback` | 1.05 | Upper clamp |
| `b68_4_target_age_hours` | `regime_age` | 6.0 | Middle of PRIME band |
| `b68_4_sensitivity` | `regime_age` | 0.10 | Slope of factor vs age |
| `b68_4_min` | `regime_age` | 0.92 | Lower clamp |
| `b68_4_max` | `regime_age` | 1.05 | Upper clamp |
| `b68_5_dbs_slope_min` | `path_b_sustainability` | 0.0 | Non-negative slope to admit Path B |

10 new module_constants total, 3 new module names.

### E. Observability + Verification

**E.1** All 3 factors LIVE — no shadow flags. Per Kyle's no-shadow-theater directive.

**E.2** `paper_sim_trades.regime_confidence_modulated` column reflects full chain after deploy: `raw × macro_modifier × phase_weight × freshness × outcome_feedback`, post-clamp.

**E.3** Per-factor ablation rows visible in dashboard: `b67_4_outcome_feedback`, `b68_4_regime_age`, `b68_5_path_b_sustainability` (already-rendered table extends naturally).

**E.4** New structured log lines:
- `[B67.4][feedback] regime=X strategy=Y ema_pnl_pct=Z sample_count=N` — emitted on EMA update
- `[B68.4][freshness] pair=X age_hours=Y factor=Z` — emitted at first signal eval per pair per cycle
- `[B68.5][gate] pair=X dbs=Y slope=Z gate_admitted=BOOL regime_label=R` — emitted when Path B encounters the gate

**E.5** OutcomeFeedbackStore disk file `/tmp/b67-4-outcome-feedback.json` written on each EMA update. Shape: `Record<string, {ema_pnl_pct, sample_count, last_update}>`.

**E.6** **Calibration window starts** post-deploy when all 5 factor types are emitting rows correctly: `b67_1_*` (3 per-input rows), `b67_2_phase_preference`, `b67_4_outcome_feedback`, `b68_4_regime_age`, `b68_5_path_b_sustainability` — verified via psql query showing recent rows for each factor_name.

### F. Governance

**F.1** Update on completion: `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `MEMORY.md` (truth + repo copy), `SYSTEM_IMPACT_MAP.md` (add B67.4/B68.4/B68.5 entries with cross-references), `SYSTEM_MANUAL.md` (modulation chain order + outcome feedback formula + freshness factor + Path B sustainability gate), `CHANGES_AND_FIXES.md` (entry per lever), master plan §0.11.B (mark cheap-tier bundle ✅ SHIPPED), `RUNNING_ISSUES.md` (open Case B/D backtest as deferred to B68.1), `BATCH_67_PROGRESS_REPORT.md` (B67.4 closure section appended).

**F.2** Migration files: forward + rollback for the 10 module_constants seeds across 3 modules.

---

## Verification Criteria (Step 11 closure)

- [ ] All 5 factor row types appearing in `regime_factor_alternates` table within 1h post-deploy
- [ ] `OutcomeFeedbackStore` accumulating entries (psql query on table OR direct file inspection)
- [ ] Per-factor ablation rows visible in UI dashboard (5 active row types: 3 b67_1 + b67_2_phase_preference + b67_4 + b68_4 + b68_5)
- [ ] `regime_confidence_modulated` column shows multi-factor chain effects (variance increased vs pre-B67.4)
- [ ] `[B67.4][feedback]`, `[B68.4][freshness]`, `[B68.5][gate]` log lines all visible in PM2 logs within 1h
- [ ] No `[B67]` or `[B68]` errors
- [ ] All 4 CI checks GREEN (with TS Check pre-existing legacy errors acceptable per established baseline)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] Calibration window officially starts (Day 0 of 14)
- [ ] All §F governance docs updated, completion report appended to B67_PROGRESS_REPORT.md (not separate file)

---

## Risks + Mitigations

**R1: B68.5 Case-C gate over-rejects Path B classifications, signal volume drops.** Mitigation: `b68_5_dbs_slope_min` is in module_constants — if drop is too aggressive, raise the threshold or set it to a small negative number to allow slightly-decaying-but-still-positive moves through. Backtest in B68.1 will pick optimal value.

**R2: Outcome feedback EMA based on tuple counts may have small samples for less-traded (regime, strategy) tuples.** Mitigation: cold-start floor (`b67_4_min_samples = 5`) prevents factor application until tuple has accumulated. Cold-start metadata flag visible in ablation row for diagnostics.

**R3: Modulation chain now stacks 5 multipliers (macro × phase_weight × freshness × outcome × clamp).** Each is bounded at [0.85, 1.10] roughly. Compounded extreme: `0.85 × 0.85 × 0.92 × 0.85 = 0.566` (penalty-stacked) and `1.05 × 1.10 × 1.05 × 1.05 = 1.273` (boost-stacked, then clamped to 1.0). Reasonable spread, no degeneracy.

**R4: Path B label flip on borderline cases (slope just below threshold) creates ablation noise.** Acceptable — this is observable in the `b68_5_path_b_sustainability` row's `factor_value_with` vs `factor_value_without`. The ablation framework is built for this.

**R5: `OutcomeFeedbackStore` persistence file growth.** Each (regime, strategy) tuple is one entry. 5 regimes × 18 strategies = 90 maximum tuples. Each entry < 100 bytes. Total < 10KB even fully populated. Trivial.

**R6: Compound effect of all 3 new factors makes calibration check messy** (5 factors moving simultaneously vs 2 in B67.1+2 alone). Mitigation: ablation framework captures per-factor counterfactuals; calibration check can run per-factor independently OR on the modulated composite. Both supported by the existing schema.

---

## Out of Scope

- **B68.1 multi-TF DBS infrastructure** — separate batch
- **Case B + D Path-B gates** — require B68.1 multi-TF data
- **Four-case Path B backtest** — runs in B68.1 per §0.8
- **B67.5 consumer wiring** — follows calibration window
- **Other 4 regime branch desaturation** — `RUNNING_ISSUES.md` #40, post-window
- **Active-trading wiring** — B67.4 modulates VTS confidence; active trading is OFF; if reactivated, paper-execution-engine reads same `regime_confidence_modulated` from MCE so transparently inherits

---

## Open questions for Langston (Step 1 review)

1. **B68.5 Case C ship-now vs wait for B68.1 backtest** — I'm proposing ship Case C only (DBS slope) in this bundle, defer Case B/D to B68.1. Agree, or hold B68.5 entirely until B68.1's backtest picks the winner?
2. **B67.4 EMA alpha=0.10 (~10-trade half-life)** — appropriate, or want shorter (alpha 0.20 ~5-trade) or longer (0.05 ~20-trade)?
3. **B67.4 sensitivity=4.0** — so 1% EMA P&L → 0.04 factor delta, hits 0.85 floor at −3.75% EMA, hits 1.05 ceiling at +1.25% EMA. Reasonable, or want different scaling?
4. **B68.4 target_age_hours=6.0** — middle of PRIME band. Alternative: 2h (PRIME entry boundary) — gives bonus longer, transitions to penalty later. Lean?
5. **Modulation chain order** — I have `macro × phase_weight × freshness × outcome → clamp`. Each multiplier independent. Alternative: `macro × phase_weight` first (B67.1 + B67.2 = "regime context") then `× freshness × outcome` (B68.4 + B67.4 = "individual pair learning"). Order doesn't affect arithmetic but does affect counterfactual ablation interpretation. Lean?
6. **Anything missing or wrongly scoped?**
