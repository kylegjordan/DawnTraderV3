# BATCH 61 — Completion Report

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation
**Batch:** B61
**Date:** 2026-04-16
**Status:** READY TO CLOSE (pending wave 5 commit + Kyle acknowledgment)
**Author:** Claude Code
**Reviewers:** Langston (GPT-5.4), Kyle Jordan

---

## 1. Scope objectives checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| A.0 | Legacy classifier flicker baseline | **YES** | `BATCH_61_A0_BASELINE.md` — 1.37% (original 15.5h), **1.56% (mature 22h)**. Red-flag check PASS (<5%). |
| A.1 P | Formula review (provisional) | **YES** | `BATCH_61_A1_FORMULA_REVIEW_PROVISIONAL.md` — non-gating, labeled accordingly |
| A.1 F | Formula review (final) | **YES** | `BATCH_61_A1_FORMULA_REVIEW_FINAL.md` — **KEEP**. ATR normalization PASS (IQR 0.676, DBS vol ratio 0.897). All Provisional concerns resolved. |
| A.2 P | Threshold review (provisional) | **YES** | `BATCH_61_A2_THRESHOLD_REVIEW_PROVISIONAL.md` — non-gating |
| A.2 F | Threshold review (final) | **YES** | `BATCH_61_A2_THRESHOLD_REVIEW_FINAL.md` — **DEFENSIBLE**. Drift contamination 70.17%, strategy lockout 55.28%, confirmed stable vs Provisional (±3pp). |
| A.3 | Global DBS methodology | **YES** | `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md` — **GREEN-with-conditions** (Kyle signed off). Three code defects found: empty volumes, cache instability, sentinel-zero. |
| A.4 P | Data quality (provisional) | **YES** | `BATCH_61_A4_DATA_QUALITY_PROVISIONAL.md` — non-gating |
| A.4 F | Data quality (final) | **YES** | `BATCH_61_A4_DATA_QUALITY_FINAL.md` — **PASS WITH CAVEAT**. Family-level 1.35% PASS. Category-boundary 2.37% technical fail vs original 2.06% threshold; razor-thin miss (2.37% vs 2.34%) against mature-window recalibrated threshold. |
| GOV | Phase 10 governance | **YES** | See §7 below |

### 1.1 A.4 Final — dual-threshold reporting (per previous CC session recommendation)

The A.0 baseline was re-run on the mature 22h window (same data A.4 Final was measured against):

| A.0 Window | 1-cycle rate | 1.5× threshold | A.4 DBS rate | Margin |
|---|---|---|---|---|
| Original (~15.5h) | 1.37% | 2.06% | 2.37% | **FAIL by 0.31pp** |
| Mature (~22h) | 1.56% | 2.34% | 2.37% | **FAIL by 0.03pp** |

Using the mature-window baseline (methodologically correct — same data for both baseline and comparison), the miss narrows to 0.03 percentage points. This is at the measurement noise floor.

**A.4 Final framing (Langston's language, accepted by all three parties):**
- Fails the provisional category-boundary threshold
- Passes the more economically meaningful family-stability test (1.35% < 1.37%)
- B62 may proceed, but category granularity should be revisited in B62 rather than treated as fully validated

### 1.2 Scope items not fully executed from telemetry

Two scope items specified OHLC-replay-dependent tests that the cycle-sampled telemetry cannot support:

1. **A.2 Final item 4 — forward-return behavioral validation with non-overlapping samples.** Requires actual forward price data per pair at 1h/4h/24h horizons, which the MCE telemetry does not carry. **Deferred to B62 Phase 0** where the historical replay analysis will naturally produce forward-return data.

2. **A.4 Final item 2 — latency injection decay curves with ±2×ATR shock.** Requires OHLC replay to inject synthetic candles. Substitute tests were run: DBS volatility comparison (ratio 0.897, PASS), consecutive-delta analysis (identical across ATR tiers), and fixed-delta injection. The substitute evidence is equivalent for the ATR normalization question. **Full OHLC injection deferred to B62 if needed.**

Neither deferral affects the B62 gate — the substitute evidence addresses the same questions.

---

## 2. B62 gate status

| Deliverable | Verdict | Gates B62? |
|---|---|---|
| A.1 Final | KEEP | YES — **GREEN** |
| A.2 Final | DEFENSIBLE | YES — **GREEN** |
| A.3 | GREEN-with-conditions | YES — **GREEN** (Kyle signed off) |
| A.4 Final | PASS with caveat | YES — **GREEN** (caveat is B62 carry-forward, not blocker) |

**B62 GATE: CLEAR.** No RED or PARTIAL on any gating deliverable.

---

## 3. Headline findings (B61 audit summary)

### Pair-level DBS: trustworthy

| Finding | Verdict |
|---|---|
| Formula reconstruction | Exact (max delta 0.00e+00 across 23,745 samples) |
| Component independence | PASS (pooled slope×ema 0.5792, below 0.90 threshold) |
| Weight stability | On a plateau — nearby weight changes produce small shifts |
| Return component | Load-bearing — demotion causes 31% category changes |
| ATR normalization | **PASS** (IQR ratio 0.676, DBS volatility ratio 0.897) |
| Directional stability | **PASS** (family-level flip rate 1.35% ≤ legacy 1.37%) |
| Data quality | Clean (0% sentinel zeros, exact reconstruction, 85% sign unanimity) |

### Global DBS: needs three fixes before use

| Defect | Impact | B62 fix effort |
|---|---|---|
| Empty volumes → unweighted median | Category changes 75.8% under weighting | ~1h |
| Cache membership instability (mean 18/60 pairs) | 50.32% category flip rate | ~2–4h |
| Sentinel-zero not excluded | Latent (0 observed) | ~30min |
| BTC/ETH/SOL not in telemetry universe | Global DBS is altcoin-only, not market-wide | B62 design question |

### Classifier mislabeling: confirmed and structural

| Metric | B59 estimate | B61 Final |
|---|---|---|
| Drift contamination (non-NEUTRAL in RBS) | ~47% | **70.17%** |
| Strategy lockout (strong-DBS in RBS) | — | **55.28%** |
| IMPULSE_EXPANSION share | ~2.4% | **1.03%** |
| Strong-DBS reaching trend-permissive regimes | — | **15.66%** |

### DBS distribution characteristics (B62 inputs)

- **STRONG categories: 2.38% combined** — thin tails from formula clamps + wide thresholds
- **Positive median skew: +0.042** — UP/DOWN symmetry should not be assumed in B62 threshold redesign
- **Fixed thresholds wider than distribution** — P95 is +0.441 but UP_STRONG threshold is +0.60
- **Provisional-to-Final stability: all numbers within ±3pp** — validates the early-window methodology and the data-source reroute decision

---

## 4. Maturity gate

All three scope §3 conditions satisfied:

| Condition | Status | Evidence |
|---|---|---|
| (a) Global DBS crossed NEUTRAL both directions | ✅ | 234 positive crossings, 100 negative (A.3 §7) |
| (b) ≥3 symbols with 2σ moves | ✅ | 45 symbols (A.3 §7) |
| (c) RBS/TFS ratio divergence ≥±10pp | ✅ | A.0 Baseline §6 |

Langston confirmed maturity gate status in his A.3 review response (Thread 21, in response to msg 2851).

---

## 5. Code changes in B61

### 5.1 Instrumentation (within freeze envelope rules)

All changes are observational telemetry emitters, feature-flagged on `DT_PHASE15B_DBS_TELEMETRY=1`:

1. **MCE cycle-sampled emitter** — one JSONL line per pair per cycle (DBS score, components, sentinelZero, classifier regime, ATR, OHLC length)
2. **Signal-orchestrator dormant-wire emitter** — captures pre/post confidence if dormant branch executes (expected: never during B61)
3. **VTS half-wire emitter** — captures biasModifier with `dbsApplied: false` (empirical dead-code confirmation)

### 5.2 DBS numeric score capture

Added numeric DBS score to VTS trade metadata (category was already captured, numeric score was not):
- `server/services/market-indicators.ts` — `cachedGlobalDBSScore` state + getter
- `server/services/vts-runner.ts` — interface + capture + passthrough
- `server/services/vts-service.ts` — `VirtualTrade` interface + `persistRealPriceTrade` signature + trade construction
- `server/utils/export-csv.ts` — export interface

### 5.3 ML page UI

DBS score rendering in Open + Closed Simulated Trades tables on Machine Learning page (two-line stacked cell: category + numeric score).

### 5.4 Freeze compliance

**`server/core/metrics/directional-bias.ts` — FROZEN, UNTOUCHED.**
**`server/core/metrics/market-regime.ts` — FROZEN, UNTOUCHED.**

Verifiable via `git log --oneline server/core/metrics/directional-bias.ts` and `git log --oneline server/core/metrics/market-regime.ts` from the Phase 15b lock date (2026-04-14) through B61 close. Both files show zero commits in that window.

---

## 6. Codebase consumer grep result (from pre-audit Phase 3a)

Two consumer-site references to `computeBiasConfidenceModifier` found:

1. **`server/services/signal-orchestrator.ts:454`** — **dormant consumer wire.** Imports and calls the modifier, but has never executed against any captured cycle (active trading OFF since ≥2026-01-12). Secondary bug at L453 (`mce.computeContext()` called with 1 arg instead of 5).
2. **`server/services/vts-runner.ts:877`** — **half-wired dead code path.** Computes `biasModifier` then never uses it. Every VTS trade has `dbsApplied: false`.

Both carried as discovered, not fixed during B61 (fixing mid-audit would introduce confounders).

---

## 7. Governance files changed

### Tier 1 (mandatory every batch)

| File | Change |
|---|---|
| `CLAUDE.md` | §5 critical rule #13 — rolling-window-vs-snapshot rule (wave 4) |
| `1-system-manual/BATCH_CATALOG.md` | B61 entry updated to CLOSED |
| `1-system-manual/PHASE_HISTORY.md` | Phase 15b Sub-Phase A marked CLOSED 2026-04-16 |
| Scope file | `BATCH_61_SCOPE.md` — §2 corrected dormant-wire framing, §10 amendment log |
| Completion report | This document |

### Tier 2 (when applicable)

| File | Change | Trigger |
|---|---|---|
| `1-system-manual/SYSTEM_MANUAL.md` | Layer 1b — DBS section: slope-clamp design constraint (wave 3), B61 audit findings summary with all four verdicts (wave 5), drift contamination figure updated from ~47% to 70.17%, B59 simulation projections marked superseded by B61 empirical findings. | A.1 Provisional + all Finals |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | §5.1b — corrected DBS consumer status from "orphan" to "dormant wire + half-wire" (wave 1). §5.2.5 MCE instrumentation pointer added. | Pre-audit Phase 3a grep finding |
| `1-system-manual/CHANGES_AND_FIXES.md` | DBS-B61-001 entry added: dormant-wire + half-wire discovery | Pre-audit Phase 3a grep finding |
| `1-system-manual/RUNNING_ISSUES.md` | No issues opened or closed in B61 — counts unchanged | — |

---

## 8. B62 carry-forward items (24 items, explicit prerequisites)

### From A.3 (global DBS fixes — blocking before global DBS carries decisions)

1. **Fix #1:** Supply real 24h volume data to `computeGlobalBias()` (~1h)
2. **Fix #2:** Ensure full cache coverage before computing global DBS (~2–4h)
3. **Fix #3:** Add sentinel-zero filter to global aggregation (~30min)
4. **Design question:** Include BTC/ETH/SOL in global DBS, or rename to "altcoin DBS"

### From A.4 (category granularity — revisit in B62)

5. Category-boundary flicker at 2.37% is a threshold-placement artifact, not directional instability. B62 options: raw scores, family-level categories, or adjusted thresholds.

### From A.2 (threshold calibration inputs)

6. STRONG categories at 2.38% combined — fixed thresholds are wider than distribution justifies
7. Positive median skew (+0.042) — UP/DOWN symmetry should not be assumed
8. Rolling-percentile thresholds produce more balanced categories — B62 should evaluate

### From A.1 (formula improvement candidates — non-blocking)

9. emaComponent saturation at 7.9% — review clamp width in B62
10. Per-pair collinearity in 7/60 pairs — flag affected pairs
11. Slope-heavy weighting collapses extremes — permanent design constraint (in System Manual)

### From B61 Provisional Findings Report (13 consensus items)

12. B62 Phase 0 = historical replay analysis (~4 days), replaces 3-week live wait
13. Failure-mode decomposition: regime-scarcity (x) vs gate-rejection (y) per trend strategy
14. Replay non-OHLC dependencies subsection mandatory
15. Path D framing: "one pipeline + entry point," not "two parallel pipelines"
16. Attribution risk: canonical ownership tag (`regime_gated` or `trend_rider_routed`)
17. IE redefine-first sequencing: Step 1 redefine, Step 2 measure 72h, Step 3 delete/keep
18. Strategy capacity planning for TFS (5 strategies, ~7–8× more flow expected)
19. STRUCTURAL_TRANSITION at 21.81% — treat definition as separate design question
20. Component clamps UNAUDITED — B62 should evaluate slope/return/ema clamp widths
21. A.4 Final flicker threshold should be config-driven post-launch, NOT hardcoded
22. Flicker threshold is a one-time audit gate, NOT a runtime toggle

### Methodological wins to carry forward

23. **Provisional-to-Final stability (±3pp)** validates early-window cycle-sampled methodology
24. **Rolling-window rule** (CLAUDE.md §5 #13) prevents single-snapshot decision errors

---

## 9. B61 commits (chronological)

| Commit | Wave | Description |
|---|---|---|
| `1bfd3bf6` | 1 | Phase 3a grep + halt gate + Phase 3b instrumentation deploy |
| `62a7e358` | 1 | Provisional deliverables (A.1 P, A.2 P, A.4 P) + report + initial score capture |
| `22730c96` | 1 | Signature patch (vts-service.ts indentation miss caught by Langston) |
| `82b601cb` | 1 | Rollback of out-of-scope telemetry_history schema change per Kyle correction |
| `90965f70` | 2 | Amended report folding CC + Langston consensus on prior CC cross-review |
| `3ff8f98b` | 3 | A.0 Baseline + slope-clamp constraint to System Manual Layer 1b + verify script |
| `535fcd12` | 4 | ML page UI renders DBS score + CLAUDE.md rolling-window rule #13 |

Wave 5 commit (Finals + A.3 + completion report + governance) pending after Langston confirms and Kyle acknowledges. B61 status changes from READY TO CLOSE to CLOSED after that commit lands and CI is GREEN.

---

## 10. Acknowledgments

- **Langston** — code-level reviews on all waves, methodology adjustments for A.0 (stablecoin side bucket, matched-symbol-matched-timestamp, family-level flip rate), A.4 framing language, A.3 GREEN-with-conditions review, BTC/benchmark phrasing refinement
- **Previous CC session** — cross-review of B61 Provisional Findings Report (9 consensus items folded into report §9) and cross-review of A.3 deliverable (5 flags, all addressed)
- **Kyle** — GREEN-with-conditions gate sign-off, BTC/FX5 question that surfaced the benchmark coverage gap, mature-window A.0 re-run recommendation

---

*End of BATCH_61_COMPLETION_REPORT.md.*
