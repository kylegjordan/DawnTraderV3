# B-NEW-37 — Confidence-Inversion Forensics — CLOSURE

**Status:** CLOSED at Step 9 per Langston Step 8 verdict. Multi-mechanism diagnosis; no in-batch fix; spawn B-NEW-39 for the three-phase sequential remediation.
**Date:** 2026-05-16
**Commits:** `2331a21bb` (forensic CLI + classifyShape monotonic-down fallback) + `ba893d9e1` (statement_timeout hotfix)
**PM2:** no restart (out-of-band CLI)
**CI:** Build + Docker GREEN; TypeScript Check + Test Suite at pre-existing legacy baseline (no new failures)

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

**This batch is functional as a forensic diagnostic.** The CLI tool ran end-to-end on staging 2026-05-15 22:20 UTC, produced a 7-phase report at `Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md`. The diagnosis is decision-grade.

**This batch DOES NOT fix the confidence inversion it surfaced.** Per Langston's tightened in-batch bar (Step 1+2 review): single-line sign flip in ONE modulator qualifies for in-batch ship; multi-mechanism or input-pipeline-side does not. Forensic shows multi-mechanism. Fix spawns as B-NEW-39.

> 🚨 **THIS BATCH IDENTIFIES THE ROOT MECHANISMS OF THE INVERSION (NOT A SIGN FLIP) AND HANDS OFF TO B-NEW-39 FOR THE FIX. THE INVERSION REMAINS LIVE IN THE CHAIN UNTIL B-NEW-39 SHIPS.**

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Previously stated | Now | Reason |
|---|---|---|
| Most likely cause: single-line sign flip in one modulator | **No single-lever sign flip exists.** All 6 multiplicative levers have factor ratios within 0.99-1.01 (near-neutral). MW-U tests rule out single-modulator INVERTED verdicts. | Phase 2 + Phase 6 disable-test BOTH confirm no single lever is the resolver. |
| b68_5 hypothesis: gate-on suppresses winners more than losers (scenario A → DROP) | **Scenario B: uniform-too-aggressive.** Gate suppresses BOTH winners (-0.406) and losers (-0.391) by ~0.40 conf, MW-U p=0.094 (not significant). | Phase 3 measured per-trade Δconf split by outcome — uniform suppression dominates the signal-direction question. |
| 0.20 floor source unknown — Q5 deferred | **Source identified during Step 8 follow-up grep:** `module_constants.regime_classifier.b67_5_post_composition_floor = 0.20`. Set by B70.3b on 2026-05-05 as "Post-composition floor drop for visibility — until B67.5 lands and re-tunes based on real distribution data" (SIM §B70.3b line 1246). | Langston Step 8 nit ("run the deferred grep before drafting B-NEW-39 scope") completed. Result: it's a one-line module_constants UPDATE candidate, not a structural redesign. |
| Pre-modulation `predictiveConfidenceRaw` would be monotonic-up | **Pre-modulation shape is u-shape (mid-dip).** Not the clean monotonic-up the chain expects to operate on. | Phase 1 result. Per Langston Step 8 Q4: "A pre-modulation u-shape IS an inversion at the high end, just less severe." Raw classifier itself may be partially anti-predictive — investigated as B-NEW-39 Phase 3 only if Phases 1+2 don't fully resolve. |
| Estimated 1-2 days for B-NEW-37 + B-NEW-38 sequence | **B-NEW-37 closed same-day. B-NEW-39 inserted (~1-2 days). B-NEW-38 still queued.** B67.5 unblock target slips ~1-2 calendar days from prior estimate. | New batch inserted ahead of B-NEW-38 per Langston Step 8 sequencing. |

---

## Workflow checkpoints

| Step | Deliverable | Status |
|---|---|---|
| 1 | `B-NEW-37_SCOPE.md` | DONE |
| 2 | `B-NEW-37_PRE_AUDIT.md` with code-trace findings + SIM consult | DONE |
| Langston review | Step 1+2 APPROVE with Q1-Q5 refinements applied | DONE |
| 3 | Implementation: `scripts/b-new-37-inversion-forensics.ts` + classifyShape monotonic-down fallback in B-NEW-36 | DONE |
| Hotfix | `SET statement_timeout = '300s'` for JSONB-heavy single-factor scans | DONE |
| 4 | Implicit code review (small additive forensic script) | DONE |
| 5 | CI green | DONE |
| 6 | Staging deploy + run | DONE — ran 2026-05-15 22:20 UTC |
| 7 | First-pass verification (7 phases produced report) | DONE |
| Step 8 follow-up | 0.20 floor source grep per Langston nit | DONE — `regime_classifier.b67_5_post_composition_floor = 0.20`, set by B70.3b 2026-05-05 |
| 8 | Langston Step 8 review | DONE — CLOSE B-NEW-37 + SPAWN B-NEW-39 |
| 9 | This completion report | IN PROGRESS (this file) |
| 10 | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES (FINDING-2026-05-15-A per Langston) + SIM update + MEMORY sync | IN PROGRESS (same commit) |
| 11 | Kyle ack — **delivered as plain-language overnight summary along with B-NEW-39 outcome** | DEFERRED to B-NEW-39 close (Kyle asleep; iterating overnight per directive) |

---

## Files changed

**New:**
- `scripts/b-new-37-inversion-forensics.ts` (~500 LOC) — 7-phase forensic CLI: pre/post WR comparison, per-modulator factor × outcome (ratio + MW-U), b68_5 special case, floor analysis, legacy vs b76, disable test, fix proposal synthesis
- `Claude Comms and Packages/Scope Files/B-NEW-37_SCOPE.md`
- `Claude Comms and Packages/Scope Files/B-NEW-37_PRE_AUDIT.md`
- `Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md` (CLI output)
- `Claude Comms and Packages/Batch Completion/B-NEW-37_COMPLETION_REPORT.md` (this file)

**Modified:**
- `scripts/b-new-36-cohort-diagnostic.ts` — `classifyShape()` gains segment-based monotonic-down/up fallback (Langston Step 8 bonus todo from B-NEW-36)
- `package.json` — added `b-new-37:inversion-forensics` script entry

**No DB schema changes. No live code changes. No PM2 restart.**

---

## Three identified inversion mechanisms (priority order — handoff to B-NEW-39)

### Mechanism 1: 0.20 post-composition floor (LARGEST CONTRIBUTOR)

**Source identified:** `module_constants.regime_classifier.b67_5_post_composition_floor = 0.20`.

**History:** Set to **0.20** by **B70.3b on 2026-05-05** as "Post-composition floor drop for visibility" (SIM §B70.3b). Code default at `signal-orchestrator.ts:943-944` is **0.4** (`?? 0.4` fallback). Original value before B70.3b's drop was **0.45**. The drop was intentional and labeled in the change log as "Pure visibility — no consumer reads `regimeConfidenceModulated` until B67.5" and "until B67.5 lands and re-tunes based on real distribution data."

**Empirical impact (B-NEW-37 Phase 4):** 15.4% of trades are pinned at exactly 0.200. Pinned-trades WR = 34.5%. Free-trades WR = 23.6%. **11pp gap** — the floor is actively concentrating winners while free-floating trades drift inverted at the top deciles.

**B-NEW-39 Phase 1 fix candidate:** revert floor from 0.20 back toward 0.40-0.45 via SQL UPDATE on module_constants row. One-line config change.

### Mechanism 2: b68_5 Path-B sustainability gate uniformly over-aggressive

**Phase 3 finding:** Gate suppresses confidence by ~0.40 uniformly across winners (-0.406) and losers (-0.391). MW-U p=0.094 (not significant — gate doesn't preferentially suppress winners).

**Interpretation per Langston Q4 verdict matrix:** Scenario B: uniform-too-aggressive → **recalibrate, don't DROP**. The gate has directional value (mostly correct sign even if too compressed) but the magnitude is wrong. The -0.40 haircut compresses everything toward the floor, then the 0.20 floor catches the compressed signal and ironically concentrates winners.

**B-NEW-39 Phase 2 fix candidate:** cap the gate's downward push at ~0.10-0.15. Recalibration target language from Langston Step 8: "still in the neighborhood of the ~0.37 multiplier intuition from B-NEW-33 Step 8."

### Mechanism 3: Pre-modulation u-shape (likely raw-classifier-side, deferred)

**Phase 1 finding:** `predictiveConfidenceRaw` decile shape = `u-shape (mid-dip)`. Not clean monotonic-up.

**Interpretation:** Even before any modulation, the regime classifier's output has anti-predictive content at the top decile (smaller magnitude than the post-modulation case, but present). Modulators are doing something non-trivial on top of an already-suspect input.

**B-NEW-39 Phase 3 fix candidate:** raw-classifier forensics. Only fires if Phases 1+2 don't restore monotonic-up shape in the B-NEW-37 forensic re-run. Per Langston Step 8: "If predictiveConfidenceRaw from calculatePairRegime is anti-predictive at the top, no downstream chain fix resolves the bug." Scope: re-bin by raw-conf with regime/strategy splits, MW-U won-vs-lost on the raw distribution, verify training-vs-serve invariants.

**Potential splitoff:** Per Langston, if Phase 3's root cause turns out to be structural to the regime classifier (not a tunable knob), split Phase 3 into B-NEW-40 to keep B-NEW-39 focused.

---

## Other findings (decile data)

### Phase 2 — per-modulator factor × outcome table (b76 cohort)

| Lever | won n | lost n | won mean factor | lost mean factor | ratio | MW-U p | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| b67_2_phase_preference | 222 | 241 | 0.9818 | 0.9759 | 1.006 | 0.46 | inert |
| b67_4_outcome_feedback | 228 | 251 | 1.0228 | 1.0180 | 1.005 | 0.007 | correct sign |
| b68_1_multi_tf_agreement | 228 | 251 | 1.0221 | 1.0155 | 1.007 | 0.020 | correct sign |
| b68_2_volume_regime | 228 | 251 | 1.0111 | 1.0111 | 1.000 | 0.88 | inert |
| b68_3_pair_correlation | 228 | 251 | 1.0328 | 1.0340 | 0.999 | 0.11 | inert |
| b68_4_regime_age | 228 | 251 | 0.9954 | 1.0047 | 0.991 | 0.17 | inert |

**No INVERTED verdicts.** b67_4 and b68_1 show slight correct-sign signal; rest are inert.

### Phase 5 — b76 decile shape (b67_4 cohort, n=901)

| Decile | conf range | n | WR |
|---:|---|---:|---:|
| 1 | 0.200 (floor) | 90 | 47.8% |
| 2 | 0.200-0.210 | 90 | 27.8% |
| 3 | 0.210-0.240 | 90 | 33.3% |
| 4 | 0.240-0.259 | 90 | 34.4% |
| 5 | 0.259-0.295 | 90 | 32.2% |
| 6 | 0.295-0.324 | 90 | 20.0% |
| 7 | 0.324-0.359 | 90 | 20.0% |
| 8 | 0.360-0.421 | 90 | 20.0% |
| 9 | 0.421-0.493 | 90 | 6.7% |
| 10 | 0.493-0.839 | 91 | 11.0% |

**Top-decile WR is 11% vs floor-pinned 48%.** The inversion is real and severe at the top end.

### Phase 6 — per-lever DISABLE test (b76 cohort)

For each lever, the alt_conf decile shape is computed (chain WITHOUT that lever). None resolve the inversion — every disable still shows monotonic-down at the top, confirming no single-lever-disable fixes the chain.

---

## Langston Step 8 verdict (verbatim, key passages)

> "Q1 — Is the multi-mechanism finding sufficient to close B-NEW-37? Yes for forensics, no for in-batch fix. The analytical phase ends here — continuing under B-NEW-37 would violate the tightened in-batch bar and scope §5.3 explicitly carves out the spawn path."

> "Q2 — b68_5 path-B gate treatment. Recalibrate first; DROP only if recalibration can't restore predictive content. A magnitude problem, not a sign problem. Recalibration target: cap the gate's downward push at ~0.10-0.15."

> "Q3 — 0.20 floor sub-batch separation? Fold into B-NEW-39 as Phase 1. Pinned WR 34.5% vs free WR 23.6% is an 11pp gap — the floor is actively inverting the top decile, not just collateral damage."

> "Q4 — Raw classifier forensics in B-NEW-39? Yes, mandatory. Phase 1 was inconclusive (pre = u-shape, post = mixed) — that doesn't acquit the raw classifier, it says the modulators are doing something non-trivial on top of an already-suspect input."

> "Q5 — Sequencing inside B-NEW-39. Sequential, not parallel. Order: (1) trace + fix 0.20 floor source — largest single-mechanism contributor and cheapest to test; (2) recalibrate b68_5 magnitude — only measurable once floor noise is removed; (3) raw classifier forensics — only if 1+2 don't restore monotonic-up."

> "Close/spawn recommendation: CLOSE B-NEW-37 at Step 9. SPAWN B-NEW-39 as the multi-mechanism fix batch with the three-phase sequential scope."

Full reply verbatim-relayed to Telegram thread 21.

---

## Bonus fix shipped: classifyShape monotonic-down branch

The B-NEW-36 diagnostic's `classifyShape()` function in `scripts/b-new-36-cohort-diagnostic.ts` was missing a segment-based monotonic-down fallback. Strict pairwise inversion counting mis-classified b76's decile shape as "undefined" when it's actually monotonic-down (35→41→33→35→32→20→20→20→7→11 — noisy first half, clean drop in second half). Added a segment-based check: if last-3-deciles average is materially below first-3-deciles average, classify as monotonic-down.

---

## Crypto regression check

**NONE by construction.** Out-of-band CLI; reads `regime_factor_alternates` only; no DB writes; no PM2 restart; no `computeFactorCalibration` aggregator changes; no `/api/analytics/factor-calibration` route changes; no UI panel changes; live scanner / VTS / cron / xstock pipeline all untouched.

---

## B-NEW-39 spawn outline (handoff)

Three-phase sequential scope per Langston Step 8 Q5:

**Phase 1: Fix the 0.20 floor.**
- Trace already done in B-NEW-37: `module_constants.regime_classifier.b67_5_post_composition_floor = 0.20`, set by B70.3b 2026-05-05.
- SQL UPDATE candidate: revert to 0.45 (original pre-B70.3b value) or 0.40 (code default fallback). Decision: pre-audit will analyze the distribution of trades-near-floor and recommend specific value.
- Verification: re-run B-NEW-37 forensic CLI after UPDATE. Expect pinned-WR-vs-free-WR gap to narrow + decile-1 to no longer be a pure floor-pinned cluster.

**Phase 2: Recalibrate b68_5 magnitude.**
- Locate the b68_5 Path-B sustainability gate's confidence-reduction logic.
- Cap downward push at 0.10-0.15 (down from current ~0.40 magnitude).
- Re-run B-NEW-37 forensic after change. Expect Phase 3 Δconf magnitudes to drop from -0.40 → -0.15 range and decile shape to approach monotonic-up.

**Phase 3 (conditional): Raw classifier forensics.**
- Fires ONLY if Phases 1+2 don't restore monotonic-up.
- Scope: re-bin by `predictiveConfidenceRaw` with regime/strategy splits, MW-U won-vs-lost on raw distribution.
- If raw classifier is structurally anti-predictive, scope split: B-NEW-40 for the raw-classifier fix (per Langston "if Phase 1 reveals the floor source is structural to the regime classifier, split Phase 3 into B-NEW-40 rather than letting B-NEW-39 sprawl").

**Verification harness:** B-NEW-37 forensic CLI is the canonical re-runnable test. After each phase change, run `npm run b-new-37:inversion-forensics` and compare verdict.

---

## Sign-off

**CC:** Forensic complete; multi-mechanism diagnosis decision-grade; 0.20 floor source traced (one-line module_constants candidate); spawning B-NEW-39 with full sequential scope per Langston directives.

**Langston:** Step 1+2 APPROVE with Q1-Q5 refinements applied (all incorporated). Step 8 verdict: CLOSE B-NEW-37 + SPAWN B-NEW-39 with three-phase sequential scope. Verbatim Telegram-relayed.

**Kyle:** ack — will receive overnight summary covering B-NEW-37 closure + B-NEW-39 progress when stable resolution is reached.
