# B-NEW-37 — b76 confidence-inversion forensics

**Status:** SCOPE DRAFT (Step 1) — pending Langston review
**Date:** 2026-05-16
**Owner:** CC (impl) + Langston (review)
**Branch:** `migration/aws-supabase`
**Prerequisite:** B-NEW-36 closed (cohort diagnostic surfaced the inversion; full report at `B-NEW-36_DIAGNOSTIC.md`)
**Unblocks:** B-NEW-38 (stratified B-NEW-33 re-run on corrected baseline) → B67.5 consumer-gate design

---

## 1. The bug, in two lines

In the b76 confidence framework (current modulation chain), **higher modulated confidence is associated with LOWER realized win rate**: top decile (conf 0.49-0.84) wins 11.2%; 9th decile (0.42-0.49) wins 6.7%; 2nd decile (0.20-0.21) wins 40.5%. Per Langston B-NEW-36 Step 8: "almost certainly a system bug, not noise". B67.5 cannot ship until this is understood and fixed.

---

## 2. What the code map tells us (pre-investigation)

From Explore agent trace of `signal-orchestrator.ts:679-951` + `factor-ablation-emitter.ts:71`:

The chain is **purely multiplicative**, applied at signal-orchestrator emit-time in this order:

```
modulatedConfChain = extendedMetrics.confidence            // PRE-modulation (= predictiveConfidenceRaw)
modulatedConfChain *= phasePreference                      (b67_2)
modulatedConfChain *= freshness.factor                     (b68_4)
modulatedConfChain *= outcome.factor                       (b67_4)
modulatedConfChain *= result.factor (volume)               (b68_2)
modulatedConfChain *= result.factor (pair_corr)            (b68_3)
modulatedConfChain *= result.factor (multi_tf)             (b68_1)
// b68_5 Path-B sustainability: NOT multiplied — label counterfactual (re-run classifier with gate disabled)
// b67_1 macro modifier: already baked in via calculatePairRegime BEFORE orchestrator chain starts
modulatedConfChain = max(orchFloor=0.4, min(1.0, modulatedConfChain))   // final clamp
```

Each modulator returns a **factor** typically in the 0.85-1.15 range. Multiplying 7 factors with mean ≈ 1.0 produces moderate compression around the pre-modulation value. The bug must live in one of three places:

- **(A)** A modulator returns a factor whose sign convention is INVERTED relative to predictive direction — e.g., volume regime returns 1.10 on signals that should win less, not more.
- **(B)** The pre-modulation `extendedMetrics.confidence` is itself anti-predictive — modulators just pass it through.
- **(C)** A specific edge case in the chain (floor clamp, clamp-cap interaction, or one modulator's edge-case branch).

**B76 batch (commit `235237ffd`, 2026-05-06) was a PURE PLUMBING refactor** — no formula/weight/threshold changes. So the inversion EXISTED before B76; B76 just made it analyzable by tagging rows with `b76_chain_final`. The pre-stall legacy cohort showed u-shape mid-dip (also non-monotonic); the post-stall b76 cohort shows clean monotonic-down. **Same underlying chain math, different cohorts.** The bug is in the chain itself, not in B76.

---

## 3. Investigation plan

### Phase 1: Pre-modulation vs post-modulation WR comparison (root cause localization)

Bin trades by **`predictiveConfidenceRaw`** (pre-modulation, the raw classifier output) AND by **`real_decision.confidence`** (post-modulation, the final chained output). Compute WR per decile on each.

**Decision rule:**
- **If PRE is monotonic-up and POST is monotonic-down:** modulation chain is inverting the signal. Move to Phase 2 (per-modulator factor analysis).
- **If PRE is ALSO monotonic-down:** the modulators are propagating an upstream anti-predictive signal. The bug is in `calculatePairRegime` (raw confidence input) — investigate the regime classifier itself.
- **If PRE is flat/random and POST is monotonic-down:** modulators are creating the inversion (most damning case). Move to Phase 2.

### Phase 2: Per-modulator factor distribution × outcome

For each of the 7 multiplicative modulators (b67_2, b67_4, b68_1-4), the B-NEW-36 data has the alternate decision metadata with `confidence_with_factor` and `confidence_without_factor` (visible in the row sample I queried 2026-05-15). Per-row factor = `confidence_with_factor / confidence_without_factor`.

For each modulator, compute:
- Mean factor for trades that won
- Mean factor for trades that lost
- Mean factor for trades that broke even
- Ratio (won_mean_factor / lost_mean_factor)

**Decision rule:**
- If `won_mean_factor > lost_mean_factor`: modulator's sign is CORRECT (boosts winners more than losers).
- If `won_mean_factor < lost_mean_factor`: modulator's sign is **INVERTED** (boosts losers more than winners). This is the bug.
- If they're equal: modulator has no predictive content (might be unintentionally inert or might just be a tie-breaker).

This per-modulator test identifies which lever(s) are sign-flipped. Most likely: one or two specific levers are inverted; the rest are correct.

### Phase 3: b68_5 Path-B sustainability special case

b68_5 is a **label counterfactual** (re-runs the classifier with the gate disabled), not a multiply factor. B-NEW-36 already showed it has mean |Δconf|=0.45 (the largest mover) and predictive lift -6.1pp (negative — disabling it produces a better signal).

For each trade in `regime_factor_alternates` with `factor_name = 'b68_5_path_b_sustainability'`, the row has:
- `real_decision.confidence` = with the gate ON
- `alternate_decision.confidence` = with the gate OFF

Compute per-row delta = real - alt:
- For winning trades: is mean delta POSITIVE (gate boosts winners) or NEGATIVE (gate suppresses winners)?
- For losing trades: same question.

If gate-on confidence is HIGHER on losing trades than on winning trades, b68_5 is suppressing the right answer. Almost certainly contributes to the inversion. Confirmed-DROP candidate (was Langston's Step 8 hypothesis as ~0.37 calibration multiplier candidate; now more likely a full DROP if forensics confirm gate-on-WR-is-worse).

### Phase 4: Floor-clamp analysis

The chain ends with `max(orchFloor=0.4, ...)`. The B-NEW-36 deciles show:
- Decile 1: confidence = 0.200 (n=892, WR=35.3%) — there's a SECOND floor at 0.20 somewhere
- Decile 2: confidence = 0.200-0.210 (n=893, WR=40.5%) — just above the floor
- Decile 9: confidence = 0.422-0.493 — sitting near/at the 0.4 orch floor
- Decile 10: confidence = 0.493-0.839 — above the floor

Compute % of decile-9-10 trades at the floor, then check whether floor-pinned trades have a different WR than free-floating high-confidence trades. If floor pinning concentrates losers, the floor is fighting the chain.

Also: WHERE is the 0.20 floor coming from? It's not the orch floor (=0.4 default). Trace.

### Phase 5: Cutover sanity check (Langston A1 follow-up)

Per Langston Step 8: "B-NEW-37 should explicitly confirm the inversion is post-b76-cutover and didn't exist under legacy." We have two cohorts to compare:

- Legacy framework rows (pre-stall n=7,544 + post-stall n=4,953 = 12,497 total). Decile shape: u-shape mid-dip per B-NEW-36.
- b76 framework rows (post-stall n=8,877 + pre-stall n=49 too small). Decile shape: monotonic-down (mis-labeled "undefined" by classifier).

**Test:** is the legacy u-shape mid-dip a milder version of the same inversion, or a different artifact? Specifically:
- Legacy decile 10 WR: 26.6% (vs b76 decile 10: 11.2%)
- Legacy decile 9 WR: 18.9% (vs b76 decile 9: 6.7%)

Legacy is less severe but still has the high-end WR drop. **My hypothesis: same chain, same bug; b76 just produces cleaner detection because the framework split removes some pre-B76 noise**. Verify this empirically.

### Phase 6: Identify the SPECIFIC modulator(s)

After Phase 2 + 3 identify which levers are sign-flipped, write a per-lever DISABLE test: zero out each lever's contribution one-at-a-time and re-compute the post-modulation confidence. If disabling lever X resolves the decile-WR inversion (decile 10 WR > decile 1 WR), lever X is the resolver.

### Phase 7: Fix proposal + impact analysis

Once root cause(s) identified, propose the fix. Most likely shapes of the fix:
- Sign flip in modulator code (e.g., `factor = 0.95 + 0.10 * z_score` should be `factor = 1.05 - 0.10 * z_score`).
- Threshold rotation (e.g., `factor = high_value` boundaries reversed).
- Removal of an entire lever (if it's net-harmful with no defensible sign correction).

Impact analysis: which downstream consumers read modulated confidence? Currently NONE — chain is decorative pre-B67.5. So shipping the fix is low-risk: it changes ablation row outputs but doesn't change live trade decisions.

---

## 4. Out of scope

- **Retraining b76 if the bug is a label-flip in training/calibration data.** Per the code map, the b76 chain is **rule-based** (each modulator computes from current state, no trained model). There's no "training holdout" to query. Root-cause priors (1) "label flip in b76 training" and (3) "train-vs-serve mismatch" from Langston Step 8 are NOT APPLICABLE — they assumed b76 was a trained model. The actual chain is hand-coded modulators applied multiplicatively. **Forensics narrows to (2) feature-polarity error or (4) rank-vs-calibration drift.**
- **Live re-deployment of the fix.** Once root cause + fix proposed, ship as own batch (this batch's scope ends at "fix proposed + verified against the ablation cohort").
- **B-NEW-38 stratified re-run.** Separate next batch.
- **Bonus fix for B-NEW-36's `classifyShape()`** (missing monotonic-down branch) — fold into B-NEW-37 implementation since the forensic CLI builds on that script.

---

## 5. Architectural decisions

### 5.1 Forensic CLI tool, not live code change

**Proposed:** new one-shot CLI `npm run b-new-37:inversion-forensics`. Read-only — pulls existing `regime_factor_alternates` data and runs the 6 phases of analysis. Output Markdown + write to `Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md`.

**Rationale:** the bug needs to be diagnosed before any code change. Forensic CLI is the right tool. Live fix ships in B-NEW-37 final commit OR as a follow-up sub-batch if Langston wants Step 4 code review separately.

### 5.2 Use existing ablation data — no re-simulation

All 7 multiplicative modulators have already emitted alternate_decision rows with confidence_with_factor and confidence_without_factor in metadata. No need to re-run signal-orchestrator; the data is in the table.

### 5.3 Fix in this batch IF root cause is localized + simple

If forensics pinpoints a single-line sign-flip in one modulator, ship the fix in this batch (single diff, easy to review). If forensics shows a multi-modulator issue or a structural redesign is needed, propose the fix and split implementation into B-NEW-39 (or similar) for separate scope/review.

### 5.4 Defer Langston's "b68_5 calibration multiplier ~0.37" recommendation

That came from B-NEW-33 Step 8 BEFORE the B-NEW-36 inversion was discovered. With the inversion now front-and-center, the b68_5 treatment depends on Phase 3 findings (is it a gate-direction bug or a magnitude bug?). Defer to Phase 7 fix proposal.

---

## 6. Verification criteria

| # | Criterion | How verified |
|---|---|---|
| 1 | Pre vs post modulation WR comparison produced | Phase 1 section in report |
| 2 | Per-modulator factor × outcome analysis for all 7 multiplicative levers | Phase 2 section with 7 sub-tables |
| 3 | b68_5 Path-B sustainability special-case analysis | Phase 3 section |
| 4 | Floor-clamp analysis identifies the 0.20 floor source | Phase 4 section |
| 5 | Legacy vs b76 cohort comparison confirms same bug, different visibility | Phase 5 section |
| 6 | Per-lever DISABLE test identifies the specific modulator(s) causing inversion | Phase 6 section |
| 7 | Concrete fix proposal with code reference, impact analysis, and expected effect on the decile WR curve | Phase 7 section |
| 8 | No regression to live aggregator, no DB writes | Out-of-band CLI; git diff confirms |
| 9 | Bonus: `classifyShape()` monotonic-down branch added to B-NEW-36 script | Diff in `scripts/b-new-36-cohort-diagnostic.ts` |

---

## 7. Workflow checkpoints

| Step | Owner | Deliverable |
|---|---|---|
| 1 | CC | This scope file |
| 2 | CC | `B-NEW-37_PRE_AUDIT.md` — SIM consult + sample row inspection + verify modulator code references |
| Langston | Langston | Combined scope + pre-audit review |
| 3 | CC | Implementation: `scripts/b-new-37-inversion-forensics.ts` + `classifyShape()` monotonic-down fix |
| 4 | Langston | Code-diff review pre-push (forensic CLI, not live code) |
| 5 | CC | CI green |
| 6 | CC | Deploy + run on staging |
| 7 | CC | Verify: report shows all 7 phases + concrete root-cause identification |
| 8 | Langston | Step 8 review of forensic findings + fix proposal |
| 9 | CC + Langston | Iterate on fix proposal if needed |
| 10 | CC | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY sync |
| 11 | CC | `B-NEW-37_COMPLETION_REPORT.md` + Kyle ack |

---

## 8. Questions for Langston

1. **Root-cause priors (1) and (3) from your Step 8** — both assumed b76 was a trained model. Code map confirms it's a rule-based multiplicative chain. Confirm we narrow to (2) feature-polarity and (4) rank-vs-calibration drift?
2. **Scope of the fix in this batch** — single-line sign flip = ship in batch. Multi-modulator or structural = propose only, separate ship batch. Agree?
3. **Phase 2 metric** — is `mean_factor_won / mean_factor_lost` the right single statistic, or do you want a Mann-Whitney U test on the per-row factor distributions?
4. **b68_5 treatment** — given B-NEW-36 already showed predictive lift = -6.1pp on b68_5, do we treat it as a confirmed harmful gate (DROP candidate) regardless of Phase 3 findings, or wait for the Phase 3 evidence before recommending?
5. **Floor at 0.20** — any prior knowledge of where the 0.20 floor lives? Code map didn't surface it; might be in the SQE path, or a pre-orchestrator floor, or in `calculatePairRegime`.

---

## 9. Risk + concerns

- **Risk: forensics surfaces a structural problem that needs a redesign, not a sign flip.** Mitigation: scope split. Forensics + fix proposal in this batch; implementation in B-NEW-39 if redesign needed.
- **Risk: pre-modulation `predictiveConfidenceRaw` is ALSO inverted (root cause upstream of the modulation chain).** This expands scope significantly. Mitigation: Phase 1 produces a clear yes/no on this; if yes, separate batch B-NEW-39 (raw-classifier forensics) before B-NEW-37 closes.
- **Risk: the 0.20 floor is fundamental to the regime classifier and changing it is high-risk.** Mitigation: Phase 4 documents; doesn't propose changes to the floor without separate scope.
