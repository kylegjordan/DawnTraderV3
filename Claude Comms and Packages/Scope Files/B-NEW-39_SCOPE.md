# B-NEW-39 — Multi-mechanism inversion fix (floor revert + b68_5 recalibration)

**Status:** SCOPE DRAFT (Step 1) — pending Langston review
**Date:** 2026-05-16
**Owner:** CC (impl) + Langston (review)
**Branch:** `migration/aws-supabase`
**Prerequisite:** B-NEW-37 closed (forensic diagnosis complete; multi-mechanism finding documented)
**Unblocks:** B-NEW-38 (stratified B-NEW-33 re-run) → B67.5 consumer-gate design

---

## 1. The diagnosis we're acting on (from B-NEW-37)

The b76 modulation chain is inversely correlated with realized WR at the top decile. Forensic identified TWO interacting defects (FINDING-2026-05-15-A):

**Defect 1: `module_constants.regime_classifier.b67_5_post_composition_floor = 0.20`**
- Set by B70.3b 2026-05-05 as "Post-composition floor drop for visibility — until B67.5 lands and re-tunes based on real distribution data" (SIM §B70.3b line 1246).
- 15.4% of trades pinned at 0.200; pinned WR 34.5% vs free WR 23.6% (11pp gap, floor concentrating winners).
- Code default at `signal-orchestrator.ts:943-944` is 0.4; original pre-B70.3b value was 0.45.

**Defect 2: b68_5 Path-B sustainability gate uniformly over-aggressive (-0.40 Δconf magnitude)**
- Gate suppresses confidence by ~0.40 uniformly (winners -0.406, losers -0.391, MW-U p=0.094 — scenario B uniform-too-aggressive per Langston Q4 matrix).
- DB state today: `module_constants.path_b_sustainability.b68_5_path_b_momentum_min` has TWO rows (0.001 and 0.0005, scoped overrides). Code default is 0.002. Gate is already more permissive than code default but the Δconf magnitude remains -0.40.

**No single multiplicative-lever sign flip exists** — all 6 modulators have factor ratios 0.99-1.01 (Phase 2). The chain's inversion is structural to the floor + b68_5 interaction, not a sign error in any specific lever.

---

## 2. Three-phase sequential scope (per Langston Step 8 Q5)

### Phase 1 — Revert the 0.20 floor (cheapest, largest contributor)

**Action:** SQL UPDATE `module_constants.regime_classifier.b67_5_post_composition_floor` from 0.20 to **0.45** (the original pre-B70.3b value).

**Rationale for 0.45 specifically:** B70.3b's change log explicitly says this is the value to revert TO ("until B67.5 lands and re-tunes based on real distribution data"). The visibility-window justification was a calibration-time override; calibration window (B-NEW-33) has closed. 0.45 is also consistent with peer floors in module_constants (pattern_pool_gates.final_score_floor=0.45). Code default 0.4 is the cold-start fallback; the actual configured value at original ship was 0.45.

**Migration script:** new file `scripts/b-new-39-phase1-floor-revert.sql`:
```sql
BEGIN;
UPDATE module_constants
SET value = '0.45', updated_at = NOW()
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor'
  AND value::text = '0.20';
-- Verify exactly 1 row updated
SELECT * FROM module_constants
WHERE module_name = 'regime_classifier' AND constant_name = 'b67_5_post_composition_floor';
COMMIT;
```

**Verification:** re-run B-NEW-37 forensic CLI. Expected:
- % trades pinned at exactly 0.200 drops from 15.4% to ~0% (the floor moves up so the pinned cluster disperses across the 0.20-0.45 range)
- Phase 4 pinned-WR vs free-WR gap narrows substantially (because there's no longer a 0.20 pin)
- Decile shape: deciles 9-10 (currently 7-11% WR) should improve as some of the artificially-low-confidence winners now have higher confidence values

**Decision gate:** if Phase 1 alone restores monotonic-up shape, Phase 2 may be deferred. If non-monotonic shape persists, proceed to Phase 2.

### Phase 2 — Recalibrate b68_5 Path-B gate magnitude (only after Phase 1 verified)

**Action:** SQL UPDATE `module_constants.path_b_sustainability.b68_5_path_b_momentum_min` rows.

**Current DB state:**
- `b68_5_path_b_momentum_min = 0.001` (one scope)
- `b68_5_path_b_momentum_min = 0.0005` (another scope)
- Code default in DEFAULT_REGIME_CONFIG: 0.002

**Proposed change:** lower both rows to 0.0 (allow Path B classification on any non-negative momentum). Rationale: Phase 3 of B-NEW-37 showed the gate's uniform -0.40 Δconf suggests it's binary-suppressing too aggressively. Lowering the threshold to 0.0 admits more trades into the TFS branch (where confidence formulas are higher) while still excluding negative-momentum (anti-trend) signals.

**Alternative options to discuss in pre-audit:**
- 0.0 (no momentum gate; only DBS-strong filter applies)
- -0.001 (allow weak negative momentum — overly permissive)
- 0.0005 / 0.0008 (intermediate easing)

**Migration script:** `scripts/b-new-39-phase2-b68-5-recalibrate.sql` — exact value to be decided in pre-audit after running a "what-if" SQL analyzing the distribution of Path B candidates by momentum value.

**Verification:** re-run B-NEW-37 forensic. Expected:
- Phase 3 Δconf magnitudes drop from -0.40 toward -0.15 to -0.25 range
- Phase 1 post-modulation decile shape improves further (top deciles climb)

**Decision gate:** if Phases 1+2 restore monotonic-up shape, Phase 3 is unnecessary. Proceed to B-NEW-38 directly. If shape STILL not monotonic-up after both phases, Phase 3 fires.

### Phase 3 (conditional) — Raw classifier forensics

**Fires ONLY if Phases 1+2 don't restore monotonic-up shape.**

**Scope:** investigate `predictiveConfidenceRaw` (pre-modulation) directly. Phase 1 of B-NEW-37 showed it's u-shape (mid-dip) — the chain might be operating on a partially anti-predictive raw signal that no downstream fix can resolve.

**Approach:**
- Re-bin by `predictiveConfidenceRaw` (NOT post-modulation) with regime/strategy splits
- MW-U won-vs-lost on raw distribution per regime
- Verify training-vs-serve invariants on the upstream classifier in `server/core/metrics/market-regime.ts::calculatePairRegime`
- Trace each regime branch (TFS, RBS, IE, ST, HVU) confidence formula for anti-predictive content

**Per Langston: "If predictiveConfidenceRaw from calculatePairRegime is anti-predictive at the top, no downstream chain fix resolves the bug."**

**Splitoff risk:** if Phase 3 surfaces a STRUCTURAL bug in the regime classifier (not just a tunable knob), split into **B-NEW-40** rather than letting B-NEW-39 sprawl. Langston explicit guidance: "if Phase 1 reveals the floor source is structural to the regime classifier, split Phase 3 into B-NEW-40 rather than letting B-NEW-39 sprawl."

---

## 3. Out of scope

- **B-NEW-38 stratified B-NEW-33 re-run** — stays blocked until B-NEW-39 closes. Per Langston: "re-running on a known-broken baseline wastes the cohort."
- **B67.5 consumer-gate design** — unblocks after B-NEW-38.
- **Removing b68_5 entirely (DROP candidate from B-NEW-33 Step 8)** — superseded by Langston Step 8 of B-NEW-37: "Recalibrate first; DROP only if recalibration can't restore predictive content." Scenario B (uniform-too-aggressive) → recalibrate, not DROP.
- **Raw-classifier rewrite** — out of B-NEW-39 scope. If Phase 3 fires and a structural fix is required, splitoff to B-NEW-40.

---

## 4. Verification approach

The B-NEW-37 forensic CLI (`npm run b-new-37:inversion-forensics`) is the canonical verification harness. Run after each phase. Compare verdict:

| Metric | Pre-fix (current) | Phase 1 target | Phase 1+2 target |
|---|---|---|---|
| % trades at 0.200 floor | 15.4% | ~0% (floor moved to 0.45) | ~0% |
| Top-decile WR | 11% | ≥20% | ≥30% (monotonic-up) |
| Bottom-decile (floor-pinned) WR | 47.8% | N/A (no pin) | N/A |
| Phase 3 Δconf magnitude (b68_5) | -0.40 | -0.40 (unchanged) | -0.15 to -0.25 |
| Decile shape classification | mixed/monotonic-down | monotonic-up OR flat | monotonic-up |

Also re-run B-NEW-36 cohort diagnostic to confirm the broader cohort view shows improvement.

---

## 5. Architectural decisions

### 5.1 SQL-only fixes for Phases 1+2

**Proposed:** both phases ship as `scripts/b-new-39-phaseN-*.sql` migration scripts. No code changes. The code already reads these values from module_constants via the existing infrastructure (`getConstant` calls in `signal-orchestrator.ts` and `market-regime.ts`).

**Rationale:** zero code review surface; pure config rollback (Phase 1 reverts to original pre-B70.3b value) and config tightening (Phase 2 takes existing rows toward limit values). PM2 picks up new values on next module_constants reload cycle (or immediately via the read-through pattern; need to verify timing).

### 5.2 Sequential not parallel (per Langston)

**Phase 1 → verify → Phase 2 → verify → (conditional) Phase 3.** Each phase changes the distribution that the next phase reads from, so running in parallel loses signal.

### 5.3 Verification re-runs as Step 7 checkpoints

After each phase's SQL UPDATE, re-run B-NEW-37 forensic CLI on staging. Capture before/after metrics. The "stable resolution" gate for closing B-NEW-39 is: post-fix B-NEW-37 forensic shows decile shape `monotonic-up` or `flat` (no longer monotonic-down or mixed).

### 5.4 No PM2 restart needed

`module_constants` reads are through `getConstant` which hits the DB on each call (with caching). Changes take effect on next read; no service restart required. SIM consult confirms this for `signal-orchestrator.ts` orchFloor read and `calculatePairRegime` b68_5PathBMomentumMin read.

### 5.5 Rollback plan

Each phase's SQL migration is wrapped in a transaction with a rollback script. If verification shows degradation (e.g., system over-corrects and high-conf trades now lose more), revert via the rollback script and re-evaluate.

---

## 6. Verification criteria

| # | Criterion | How verified |
|---|---|---|
| 1 | Phase 1 SQL migration applied successfully (1 row updated) | Migration script returns expected row count |
| 2 | Phase 1 post-fix: % pinned at 0.200 drops to ~0% | Re-run B-NEW-37 forensic; Phase 4 metric |
| 3 | Phase 1 post-fix: top-decile WR improves materially | Re-run B-NEW-37; Phase 5 decile table |
| 4 | Phase 2 SQL migration applied successfully | Migration script row counts |
| 5 | Phase 2 post-fix: Δconf magnitude drops from -0.40 to -0.15 to -0.25 | Re-run B-NEW-37; Phase 3 metric |
| 6 | Phase 2 post-fix: decile shape classification = monotonic-up or flat | Re-run B-NEW-37; Phase 5 shape verdict |
| 7 | (Conditional) Phase 3 fires only if shape still problematic post-Phase-2 | Decision gate documented in completion report |
| 8 | B-NEW-36 cohort diagnostic re-run on full cohort shows improvement | Re-run `npm run b-new-36:cohort-diagnostic` |
| 9 | Crypto regression: NONE | Module-constants reads only; no code changes; no live impact |
| 10 | Rollback path documented + tested | Rollback SQL committed alongside forward migration |

---

## 7. Workflow checkpoints

| Step | Owner | Deliverable |
|---|---|---|
| 1 | CC | This scope file |
| 2 | CC | `B-NEW-39_PRE_AUDIT.md` with module_constants row inspection + SIM consult + what-if analysis for Phase 2 value |
| Langston | Langston | Combined scope + pre-audit review |
| 3a | CC | Phase 1 SQL migration: `scripts/b-new-39-phase1-floor-revert.sql` |
| 4a | Langston | Phase 1 SQL review (one-line config change, minor scrutiny) |
| 6a | CC | Apply Phase 1 on staging via psql |
| 7a | CC | Re-run B-NEW-37 forensic, verify Phase 1 metrics |
| 3b | CC | Phase 2 SQL migration: `scripts/b-new-39-phase2-b68-5-recalibrate.sql` |
| 4b | Langston | Phase 2 SQL review (value choice from what-if analysis) |
| 6b | CC | Apply Phase 2 on staging |
| 7b | CC | Re-run B-NEW-37 forensic, verify Phase 2 metrics |
| 8 | Langston | Step 8 review of post-fix forensic |
| 3c (conditional) | CC | Phase 3 raw-classifier forensics (if shape still problematic) |
| 10 | CC | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY sync |
| 11 | CC | `B-NEW-39_COMPLETION_REPORT.md` + Kyle ack |

---

## 8. Questions for Langston

1. **0.45 as the Phase 1 target value** — original pre-B70.3b setting, peer-floor-consistent. Agree, or prefer 0.40 (code default) or different?
2. **0.0 as the Phase 2 target for `b68_5_path_b_momentum_min`** — current values are 0.001 and 0.0005 (scoped overrides). Code default 0.002. 0.0 = "any non-negative momentum admits Path B." Or do you want pre-audit's what-if SQL to drive the exact value?
3. **Two-row scoping for `b68_5_path_b_momentum_min`** — update both rows to the same target, or maintain the differential? Need to identify what scoping dimension produces the 0.001 vs 0.0005 split.
4. **Sequential pacing** — apply Phase 1, re-run forensic, then human-review-then-Phase-2? Or apply Phase 1 + Phase 2 in same session with intermediate forensic verification? My read: sequential with intermediate verification, per your Step 8.
5. **Rollback automation** — if verification shows degradation post-Phase-1, auto-rollback or human gate?

---

## 8b. Langston Step 1+2 review — APPROVE with revisions applied (2026-05-15/16)

**Verdict:** APPROVE for Phase 1 implementation. Phase 2 needs revision per Q2 + Q3 below before SQL is written. Verbatim relayed to Telegram thread 21.

### Q1-Q5 resolutions

- **Q1 — 0.45 target for Phase 1: APPROVED.** B70.3b commit log explicitly names 0.45 as revert target; peer-floor-consistent; reverting to as-shipped value (not code-default 0.40 which is cold-start fallback).
- **Q2 — Phase 2 target REVISED:** intermediate step. Take only the wildcard `b68_5_path_b_momentum_min` row from 0.001 → **0.0005** first, NOT directly to 0.0. Re-verify. Only step to 0.0 if 0.0005 doesn't move the needle.
- **Q3 — Two-row scoping RESOLVED:**
  - Wildcard row (catches crypto_spot + crypto_perp): regime=TFS, value=0.001 ← Phase 2 target
  - xstock_spot-scoped row: regime=TFS, value=0.0005 ← **DO NOT TOUCH** (Langston: xstock has its own dynamics; treat separately)
- **Q4 — Sequential pacing APPROVED.** Apply Phase 1 → verify → Phase 2 if shape still non-monotonic-up. No human gate required between phases per Kyle's "iterate to conclusion" directive. Re-engage Langston at Step 8 with post-fix forensic.
- **Q5 — Rollback HUMAN-GATED:** rollback SQL committed alongside forward migration but execution is manual. Avoid auto-rollback oscillation risk.

### Langston Concerns A-D resolutions

- **Concern A (cache TTL):** RESOLVED. `module-constants-service.ts:51` defines `CACHE_TTL_MS = 60_000` (60s). Post-UPDATE propagation is bounded at ~60s. Verification will wait ~2 hours for natural emission accumulation.
- **Concern B (forensic must read post-fix rows):** RESOLVED. Added `--since=<ISO timestamp>` flag to B-NEW-37 forensic CLI (`scripts/b-new-37-inversion-forensics.ts`). Phase 1/Phase 2 verification will use `npm run b-new-37:inversion-forensics -- --since=<UPDATE_TS>` to filter to post-fix rows only.
- **Concern C (completion gate `monotonic-up` only):** APPLIED. Tighten §5.3 — **`flat` shape triggers Phase 3 (NOT closure)**. Only `monotonic-up` closes the batch.
- **Concern D (intermediate-step value for Phase 2):** APPLIED per Q2 above. 0.0005 first, 0.0 only if 0.0005 doesn't move the needle.

### §5.3 completion gate (updated)

After each phase, run B-NEW-37 forensic with `--since=<phase_UPDATE_TS>`. Stable closure criteria:
- Decile shape on b67_4_outcome_feedback subset = **`monotonic-up`** (strict — NOT `flat`)
- Phase 4 metric: % at 0.200 floor ≈ 0% (post-Phase-1) or no longer concentrating outliers post-Phase-2
- Phase 3 metric: Δconf magnitude ≤ 0.25 (post-Phase-2 if it fires)
- B-NEW-36 cohort diagnostic re-run shows top-decile WR ≥ bottom-decile WR

If `flat`, Phase 3 (raw classifier forensics) fires.

---

## 9. Risk + concerns

- **Risk: floor revert from 0.20 to 0.45 reclassifies many trades from "free-floating" to "above-floor"** — distribution shifts substantially. Expected per the design, but worth measuring before/after.
- **Risk: b68_5 recalibration to 0.0 makes the gate effectively inert** — admits all Path B candidates regardless of momentum direction. If the gate has SOME predictive value at the polarity boundary, fully neutering loses it. Mitigation: Phase 2 starts at 0.0; if verification shows degradation in some metric, step back to 0.0005 / 0.001.
- **Risk: Phase 3 is needed and reveals a structural classifier bug** — extends timeline by another batch. Acceptable per Langston framing.
- **No regression risk to live trading** — confidence chain is decorative pre-B67.5; no consumer reads modulated value. Changes affect ablation row outputs only.
