# BATCH 65.6 — Per-Pair Regime Classifier Audit + Sustainability Gate

**Status:** ✅ Step-1 Langston-APPROVED 2026-04-26 (cc-inbox #822) with 5 refinements (incorporated below). Ready to start Phase A.

**Langston refinements applied:**
- Q1: ADX-floor on |DBS|-only path is the right starting hypothesis (already in input vector, minimum-viable fix). DBS-percentile deferred to Phase 19.5 if needed.
- Q2: Phase C thresholds OK + ADD explicit guard — **clean-day TFS-tagged WR must not drop more than 3pp from current baseline.** Prevents "fix hostile, break clean."
- Q3: **MCE telemetry source identified — `phase15b_dbs_telemetry` logs.** 60K entries/day, covers 04-15 → 04-22+, has full classifier inputs (dbs.score, classifier.vol/adx/mom/regime). Use as Phase C replay source; cross-ref VTS trade logs for outcomes. Feasible without new infrastructure.
- Q4: Flicker ceiling negotiable. **Make it a `module_constants` entry (`classifier_flicker_ceiling_pct`, seed 2.0).** Kyle signs off on specific number at Phase C review.
- Q5: **Phase A confidence-vs-outcome inversion check across ALL 5 regimes**, not just TFS. (Reconciliation note: Langston's Q5 referenced checking inversion on 04-18; per Kyle's same-day directive 04-18 is pre-B62 and excluded — Phase A applies the across-all-5-regimes check to the post-B62 04-22 hostile day only. If only one post-B62 hostile day is available, the across-regime inversion check has limited statistical power; flag in Phase A output and consider extending observation window.)
**Owner:** CC implementation + analysis, Langston review, Kyle decider
**Promoted from:** the originally-queued B72 slot — Kyle directive 2026-04-26 to continue this line of work NOW rather than defer
**Trigger:** `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` finding that the TFS branch in `server/core/metrics/market-regime.ts:157` fires on `|DBS| >= 0.30` alone with no sustainability check, producing the inverted confidence-vs-outcome on 04-22 (195 TFS-classified pairs at 13.8% WR vs 6 STRUCTURAL_TRANSITION-classified pairs at 83.3% WR)
**Type:** Research-then-design batch — analysis first, hypothesis second, backtest third, code last
**Numbering:** B65.6 (continuation of the B65 line, replaces the conditional-build slot from B65.5 SKIP closure)
**Predecessor:** B65.5 (closed via SKIP 2026-04-26)

---

## 1. Why this batch exists

The B65.5 Phase A0 finding established that **vwap_pullback wasn't the problem on 04-22** — every strategy was losing in those windows. The follow-up regime-classifier investigation traced the cause one layer deeper: the per-pair regime classifier was confidently classifying 82% of pairs as TREND_FRIENDLY_STABLE on a day where all trend-following strategies lost 80%+ of their trades. Pairs the classifier was *least* sure about (STRUCTURAL_TRANSITION) had the *highest* WR (83.3%).

The smoking gun in `server/core/metrics/market-regime.ts:157`:

```typescript
} else if ((mom > 0.003 && dx > 50) || absDbs >= 0.30) {
  // Threshold 0.30 is the only tested value that passes 2.0% flicker ceiling
  regime = REGIMES.TREND_FRIENDLY_STABLE;
```

The TFS branch fires on EITHER (positive momentum AND ADX > 50) OR `|DBS| >= 0.30` alone. **The second path has no sustainability check.** Any pair whose recent directional movement crosses the ±0.30 threshold gets stamped TFS regardless of whether the move has more room to run, whether volume is supporting, whether the trend is fresh vs exhausted, or whether the pair is at the top of a move about to reverse.

The code comment confirms the design priority: the threshold was tuned to keep the classifier from changing its mind too often (flicker stability), not to align with trade outcomes. Phase B65.6 is to revisit that trade-off now that we have evidence of what it costs.

---

## 2. Approach — research first, design second, code last

Same structure as B65.5. Each phase gates the next.

### Phase A — Failure-mode characterization on the over-broad TFS classifications

**Goal:** for the 04-22 cohort of 195 TFS-classified pairs that lost ~86% of their trades, characterize what the inputs to the classifier looked like at entry vs what the inputs to the 6 STRUCTURAL_TRANSITION-classified pairs (83% WR) looked like. Find the input-space dimension(s) that separate the winning STR-tagged trades from the losing TFS-tagged trades.

**Data scope (post-B62 only, Kyle directive 2026-04-26):** all analysis must restrict to **2026-04-20 onward**. The pre-B62 classifier was a different code path; including 04-18 or earlier confounds the analysis with classifier-version differences. 04-18 is OUT.

**Tasks:**

1. Pull all 04-22 trades + the inputs that fed the per-pair classifier at entry: `dbsScore`, ADX (`dx`), volatility (`vol`), momentum (`mom`), and any volume features available in the VTS log signal payload.
2. Cross-reference with the four post-B62 clean/mixed comparison days (04-20, 04-21, 04-23, 04-24, 04-25) — do the inputs that produced winning TFS classifications on those days look different from the inputs that produced losing TFS classifications on 04-22?
3. The post-B62 sample is smaller than originally hoped (740 trades total) but cleaner. If Phase A's separating signal is borderline due to sample size, plan to extend the observation window forward over the next several days before opening Phase C backtest.
4. Output: `B65_6_PHASE_A_CLASSIFIER_INPUT_AUDIT.md` with side-by-side input distributions on hostile-day-04-22 vs clean-comparison-days, and a quantified separating axis if one exists.

**Deliverable gate:** if no separating axis exists in the inputs the classifier already has access to, Phase B has to look at adding NEW inputs (e.g., volume profile, order book features, cross-pair regime concentration). If a separating axis DOES exist in current inputs, Phase B is the much smaller exercise of changing the threshold logic to incorporate it.

### Phase B — Single-rule hypothesis on the classifier change

**Goal:** specify ONE concrete rule change to `server/core/metrics/market-regime.ts:157` that would have excluded most of the 04-22 false-positive TFS classifications while preserving most of the correct TFS classifications on 04-21 / 04-24.

Candidate rule families (final shape determined by Phase A):

- **ADX-floor on the |DBS|-only path:** require `dx >= 35` (or some threshold) when |DBS| is the sole trigger. This would have demanded actual sustained directional pressure, not just recent direction.
- **Momentum-freshness check:** require `mom >= 0.001` AND DBS-vs-recent-DBS-average rising (not peaking) when |DBS| is the sole trigger.
- **Volume-support check:** require recent-volume / rolling-average-volume above some ratio.
- **DBS-percentile gate:** require current DBS to be at the 50–70th percentile of the rolling-window DBS distribution, not the 95th+ (which captures exhaustion).
- **Combination:** any of the above OR'd or AND'd together to maximize separation.

Output: `B65_6_PHASE_B_DETECTOR_HYPOTHESIS.md` with the proposed rule, the predicted effect on the 04-22 / 04-18 / 04-21 / 04-24 input distributions, and the predicted change in TFS share (must stay within the 2% flicker ceiling, OR explicitly accept a flicker-ceiling change as part of the proposal).

**Deliverable gate:** Langston reviews. If the rule can't be specified concretely or it predicts breaking the flicker ceiling without compensating mechanism, iterate Phase A → B.

### Phase C — Backtest hypothesis on historical pair-cycle inputs

**Goal:** validate the proposed rule on historical data the rule wasn't designed against. Replay the per-pair classifier with the new rule on ~30–60 days of MCE telemetry (the actual classifier inputs) and compare:

- TFS share (must stay within or beat the 2% flicker ceiling)
- Per-regime WR (TFS-tagged WR should improve; STR-tagged WR should not collapse)
- Aggregate WR across all strategies (should improve modestly)
- Particularly: WR on the days currently flagged HOSTILE (04-02, 04-12, 04-18, 04-22) — should improve materially if the rule is right

**Tasks:**

1. Identify whether MCE telemetry is archived in a way that can be replayed (telemetry-aggregator.ts / telemetry-repository.ts). If yes, replay through the new classifier rule. If no, the backtest has to use the JSONL log stream and approximate the classifier inputs from what's stored — note any limitations.
2. Compare new-rule TFS classifications against actual outcomes on the hostile + clean days.
3. Output: `B65_6_PHASE_C_BACKTEST_REPORT.md`.

**Deliverable gate (Kyle sign-off):**
- Aggregate WR across strategies improves on the historical replay
- Hostile-day TFS misclassifications drop materially (target: 04-22 TFS share drops from 82% to <60%, and TFS-tagged WR on 04-22 rises from 13.8% to >20%)
- **Clean-day TFS-tagged WR must NOT drop more than 3pp from current baseline (Langston Q2 refinement).** Prevents "fix hostile, break clean."
- Flicker stays within the `classifier_flicker_ceiling_pct` module constant (seeded 2.0; Kyle signs off on specific value at Phase C review per Langston Q4 refinement)

If any of those fail, the recommendation is **DEFER** — the classifier issue exists but no improvement that satisfies the constraints has been found in the current input space, and the work moves to either (a) adding new inputs (B67-style external data, B70 archived inputs), or (b) a downstream guardrail (AMR overlay) that catches hostile windows even when the classifier is wrong.

### Phase D — Conditional ship

**Goal:** ship the validated rule.

**Tasks:**

1. Implement the new condition in `server/core/metrics/market-regime.ts`.
2. Add unit tests covering: the new sustainability check fires on the 04-22 input pattern, does NOT fire on the clean-day TFS patterns, flicker stays within ceiling.
3. Update `SYSTEM_MANUAL.md` regime-classifier section + `SYSTEM_IMPACT_MAP.md` entry for `market-regime.ts`.
4. Standard 11-step workflow: code review, push, deploy, observation, completion report.

---

## 3. Files in scope

**Read for analysis (Phases A–C):**
- `server/core/metrics/market-regime.ts` — classifier (target file)
- `server/services/telemetry-aggregator.ts` — `getDominantRegime` aggregator (read-only, not target)
- `server/services/vts-runner.ts:1249-1251` — globalRegime field assignment at trade open (read-only)
- `/home/deploy/dawntrader/logs/virtual_trades/2026-04-*.json` — VTS logs (data source)
- MCE telemetry archive (location TBD in Phase A) — classifier-input replay source

**Write only in Phase D (build path):**
- `server/core/metrics/market-regime.ts`
- `server/core/metrics/market-regime.test.ts` (or equivalent)
- `1-system-manual/SYSTEM_MANUAL.md` regime section
- `1-system-manual/SYSTEM_IMPACT_MAP.md` entry

---

## 4. Out of scope (explicitly)

- **Global aggregation logic** (`telemetry-aggregator.ts:getDominantRegime`) — not changed, it's already correct.
- **Strategy-regime canonical map** — not changed; the regime taxonomy stays the same, only the classifier's *trigger conditions* change.
- **Other regime branches** (RBS, IE, HVU, STR) — only the TFS branch is in scope. Other branches may have similar issues but those are separate audits.
- **DBS computation itself** — the DBS score is computed elsewhere (B62 / B63 Item 16); B65.6 does not change how DBS is calculated, only how the classifier *uses* the DBS reading.
- **Phase 19.5 AMR** — separate downstream guardrail. Even with a perfect per-pair classifier, AMR is still needed for system-wide hostile-window detection. Not redundant.

---

## 5. Decision points and gates

| Gate | Owner | Decision | Outcome if no |
|---|---|---|---|
| Phase A separating axis exists in current inputs | Langston (review) | "Can current classifier inputs distinguish the false-positive TFS from the true-positive TFS?" | If no, Phase B has to look at adding NEW inputs OR escalate to Kyle |
| Phase B hypothesis is concrete + falsifiable | Langston (review) | "Is the proposed rule one specific condition that can be backtested?" | Iterate A → B |
| Phase C backtest meets BUILD thresholds (TFS share within ceiling, hostile-day WR improves, aggregate WR improves) | Langston (review) + Kyle (sign-off) | "Did the rule hold on out-of-sample data?" | Recommend DEFER, work moves to AMR or new inputs |
| Phase D code-level review | Langston (review) | Standard step-4 review | Iterate code |

---

## 6. Workflow notes

- **Iterate with Langston to consensus per CLAUDE.md §6** — only escalate to Kyle at the named gates.
- **Pre-audit (Step 2) deferred until Phase D.** Phases A–C are pure analysis; SIM consultation enters when actual code lands.
- **No B66/SQE work happens here.** B65.6 is strictly about the per-pair classifier. SQE recalibration stays at Phase 19.4 with its methodology requirement.
- **Item 15/19 spot-check findings carry over** — full results in `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` Item 15/19 addendum (added 2026-04-26 in same governance commit as this scope). Two of three claims are at least partly window-confounded; Item 15 PredConf claim mostly stands; Item 19's batch-correlation interpretation needs adjustment ("same-cycle trades all see same global state which dominates short-horizon outcome").

---

## 7. References

- `Claude Comms and Packages/Scope Files/REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` — triggering investigation
- `Claude Comms and Packages/Scope Files/B65_5_PHASE_A0_WINDOW_CONTROL.md` — predecessor finding that surfaced the issue
- `Claude Comms and Packages/Batch Completion/BATCH_65_5_COMPLETION_REPORT.md` — B65.5 closure context
- `Claude Comms and Packages/Batch Completion/BATCH_63_COMPLETION_REPORT.md` §12 — Item 13 reframe
- `server/core/metrics/market-regime.ts` — target file
- `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §10 — canonical positive cases (independent but related)
- `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 19.4 — SQE methodology requirement (separate work but same root)

---

*End of B65.6 scope draft. Sent to Langston for Step-1 review 2026-04-26.*
