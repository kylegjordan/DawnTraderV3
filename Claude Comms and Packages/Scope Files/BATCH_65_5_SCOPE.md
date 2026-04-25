# BATCH 65.5 — Strong Bull Pullback (Research → Design → Backtest → Optional Build)

**Status:** ✅ Step-1 APPROVED by Langston 2026-04-25 with 5 refinements (incorporated below). Ready to start Phase A.
**Owner:** Claude Code (implementation), Langston (review), Kyle (decider)
**Trigger:** B63 Item 13 closed 2026-04-25 with verdict **BUILD_DEDICATED** (57 trades / 21.1% WR / sumR −28.99 at 2.85× min sample)
**Type:** Research-then-design batch — analysis-first, code last (or no code at all if research recommends DROP)
**Realistic timeline:** 1–2 weeks of analysis + iteration before a viable strategy is even ready to backtest
**Numbering:** B65.5 for now; may renumber as B66.5 or B72 once scope formalizes
**Predecessor:** B63 (closed 2026-04-25, see `BATCH_63_COMPLETION_REPORT.md` §11 for the verdict block)

---

## 1. Why this batch exists

B63 promoted `vwap_pullback` into the strong-trend lane (Items 11/12/14) on the hypothesis that it was the one legacy archetype that worked on strong-trend pairs (counterfactual baseline WR 63.2% on n=19 high-DBS bullish sample). One week later the live cohort delivered the opposite: 21.1% WR on n=57.

The B63 architecture changes (Variant E geometry override, mode-overlay bypass, lane-specific routing, first-claim-wins arbitration) are not the problem. They are routing changes — they get the right pairs to the strategy. The problem is the strategy's **entry detector** is still calibrated for mean-reversion archetypes (price pulls back to VWAP and bounces back into trend), and on continuation-pair conditions in the strong-trend lane, the "pullback" the detector identifies is more often a precursor to actual reversal than a continuation. 21 of the 57 closed trades exited at break-even-stop — a pattern of "entry, small gain, immediate reverse, BE protection fires." That is not execution failure. That is detector failure.

**The gap we're closing:** there is no strategy in the canonical map designed to enter a continuation pullback on a high-DBS bullish pair AND distinguish it from a reversal pullback. Either we build one, or we accept that the strong-trend lane is a single-strategy lane (only `strong_bull_trend`) and remove `vwap_pullback` from it entirely.

---

## 2. Approach — research first, design second, code last

The previous batch's failure mode (B63 Item 11) was jumping straight from a positive-baseline counterfactual to a production deployment without an in-between phase that asked "what specifically about the existing detector would survive the lane change?" This batch will not repeat that. The phases below run sequentially; each gates the next.

**Phase order (post-2026-04-26 Kyle revision):**
1. **A0** — Market-window control (sibling-strategy WR + mode/regime overlay + time-clustering). NEW. Gates A.
2. **A** — Loser/winner pattern-classification on the 57-trade cohort (only proceeds if A0 routes to it).
3. **B** — Single-rule detector hypothesis (only proceeds if A produces a discriminating axis).
4. **C** — Backtest hypothesis on 60–90 days of historical OHLC (Kyle sign-off here).
5. **D** — Conditional build OR drop (own canonical strategy key if BUILD; one-line `MULTI_FAMILY_ELIGIBILITY` removal if DROP).

### Phase A0 — Market-window control (NEW 2026-04-26, gates Phase A)

**Goal:** before classifying patterns, determine whether the 57-trade cohort metrics reflect strategy quality or window quality. The B63 streakiness analysis (z=−15.57 runs test) established that the system has hostile windows in which every strategy posts ≤30% WR. If the cohort overlapped with such windows, pattern-classification on those trades would be measuring window noise wearing a pattern-distribution costume.

**Selection-bias risk this addresses:** if we skip A0, Phase A produces a confident-looking pattern distribution; Phase B forms a hypothesis against that distribution; Phase C backtests against historical OHLC where we may *also* have hostile-window contamination — and we end up with a "validated" detector tuned against bad-window noise rather than intrinsic edge. The detector then fails post-deploy on different bad-window stretches and we burn another cohort.

**Tasks:**

1. Pull the 57-trade cohort with `psql` (one CSV).
2. **Sibling-strategy WR** — for each trade entry timestamp, query every other strategy's trades that fired within ±60 minutes (Langston Q1: 8–15 siblings per window, clean conditions read). All 17 canonical strategies in the universe (Langston Q2: hostile-window signal needs cross-strategy correlation, not just archetype match). Compute per-window sibling WR. Then compute the cohort-wide sibling WR (mean across all 57 windows).
2a. **`strong_bull_trend` (SBT) focused control** (Langston Q3: most important A0 sub-analysis). SBT is the lane-mate, same DBS routing. Report as own row in the output table. Read: SBT winning + vwap_pullback losing in same windows = strategy problem; both losing = lane/window problem.
3. **Mode / regime overlay at entry** — for each entry, capture the active mode (`NORMAL` / `DEFENSIVE` / `SURVIVAL`), global DBS at entry, regime distribution at entry. Look for clustering in DEFENSIVE / SURVIVAL / low-global-DBS windows.
4. **Time-clustering** — are the 57 trades bunched in 2–3 specific bad-day clusters, or spread evenly across the 4-day cohort window? Bunched = window-quality story. Spread = strategy-quality story.
4a. **Per-day breakdown** (Langston Q5: makes routing decision much more defensible). For each cohort day (2026-04-21 → 2026-04-25), tally trades opened, WR that day, and same-day sibling WR. If 40+ losers concentrate on one or two specific bad days (e.g., the streakiness-analysis catastrophic day), that IS the confound in its most obvious form. A flat distribution argues against the confound.

**Outcome routing:**

| Sibling WR in same windows | Reading | Path |
|---|---|---|
| **≥ 50%** | Other strategies winning in same windows; vwap_pullback truly is the problem | Proceed with Phase A pattern-classification → B/C/D as planned |
| **≤ 30%** | Universal hostile windows; vwap_pullback may be fine | Recommend **NEITHER BUILD NOR DROP for this strategy** — finding feeds **Phase 19.5 Adaptive Market Response** (system needs hostile-window stand-down overlay, not per-strategy redesign). **Also flags a future batch (separate from B65.5) to re-evaluate the B63 Item 13 verdict** in light of conditions — Kyle directive 2026-04-26: "we might want to retest the VWAP pullback results or reconsider them based on the fact that the market conditions were not good." |
| **30–50%** | Mixed; both factors contributing | Proceed with Phase A pattern-classification BUT segment the cohort by window quality — only the bad-strategy-good-window subset gets the detector hypothesis treatment; the rest gets the AMR-overlay treatment + the future Item-13-reconsideration batch flag |

**Output:** `B65_5_PHASE_A0_WINDOW_CONTROL.md` with sibling-strategy WR table, mode/regime overlay distribution, time-clustering chart, and the routing decision (which path Phase A proceeds on).

**Deliverable gate:** Langston reviews A0 findings BEFORE Phase A pattern-classification begins. Routing decision is the gate.

### Phase A — Loser pattern-match on the 57-trade failure cohort

**Goal:** understand what the detector said vs. what the market did. Not "the strategy lost money" — that's the result, not the cause. Cause-level reading.

**Inputs:**
- `paper_sim_trades` rows for the cohort (start: PM2 #80 = 2026-04-21 15:13 UTC) where `strategy = 'vwap_pullback'` AND `source_pool = 'quant-strong_trend'`
- For each trade: entry timestamp, entry price, exit price, exit reason, sourcePool, regime at entry, dbsAtEntry, hybridScore, predictiveConfidence, finalScore, ATR-at-entry, candle context window (entry minus 30 candles, entry plus exit candles)
- Per-pair OHLC pulls for the 30 candles before each entry (pattern context)

**Tasks:**
1. Pull the cohort with `psql` and persist to a working CSV.
2. For each loser, classify the entry-context pattern:
   - True continuation pullback (price retraced to VWAP / structure, then continued the trend)
   - Reversal disguised as pullback (price retraced and KEPT going against the prior trend)
   - Range-bound chop misclassified as pullback by the detector
   - Volume-divergence pullback (price pulled back on rising volume — bearish under continuation logic)
   - **Late entry — pullback already resolving** (price bottomed 3–5 candles before entry, detector fired late on the recovery; classified separately because the failure mode is latency/cadence, not pattern misread) [Langston Q2 refinement]
   - Other (record and tally)
3. **Apply the same taxonomy to the 12 winners.** This is not optional or secondary — Phase A's discriminating signal comes from the comparison. If all 12 winners are "true continuation pullback" and 40 of 45 losers are "reversal disguised as pullback," the detector hypothesis writes itself. If winners and losers share the same pattern distribution, the pullback-classification axis is NOT discriminating and we have to look elsewhere (entry timing, DBS trajectory during the pullback, volume profile, etc.) [Langston Q5 refinement].
4. Output: `B65_5_FAILURE_COHORT_PATTERN_AUDIT.md` with side-by-side loser/winner pattern distributions, per-category sample trades, and explicit statement of whether a discriminating axis exists in the pullback-pattern dimension.

**Deliverable gate:** if the pattern distribution shows no statistically clean signal separating losers from winners (e.g., all four categories appear roughly evenly in both), the answer is DROP, not BUILD. We escalate to Kyle with that recommendation and skip Phases B–D.

### Phase B — Hypothesis on detector / filter change

**Goal:** propose ONE specific detector or filter change that would have excluded most losers while preserving most winners. Not five changes. One.

**Tasks:**
1. From the Phase A pattern distribution, identify the dominant loser category.
2. Form a single, testable hypothesis. Examples (placeholder, real hypothesis depends on Phase A):
   - "If we required pullback to occur on declining volume (not rising), 18 of the 21 BE-stop losers would have been excluded; 11 of the 12 winners would have been preserved."
   - "If we required the pullback to NOT exceed a 50% retracement of the prior swing, 14 of the losers would have been excluded; 10 of the winners preserved."
   - "If we required directional integrity score ≥ X at entry, 17 of the losers would have been excluded; 12 of the winners preserved."
3. Write the hypothesis as a single, codifiable rule in `B65_5_DETECTOR_HYPOTHESIS.md`. Specify the exact condition, the threshold, the data fields it consumes, and the predicted effect on the failure cohort.

**Deliverable gate:** Langston reviews the hypothesis. If it can't be specified concretely enough to backtest, it isn't ready — go back to Phase A.

### Phase C — Backtest hypothesis against historical OHLC

**Goal:** validate that the proposed detector change would have improved performance on out-of-sample data, not just the 57-trade failure cohort.

**Tasks:**
1. Pull historical OHLC for the strong-trend-lane pair universe (high-DBS bullish pairs) over a 60–90 day window predating the cohort start. (B70 archiving will eventually formalize this; for B65.5 we use whatever OHLC the system already has on disk plus targeted Kraken REST pulls to fill gaps.)
2. Replay the proposed `strong_bull_pullback` detector on that history. Compute WR, sumR, mean-net-%, and per-loser/winner pattern classification (same taxonomy as Phase A).
3. Compare: original `vwap_pullback`-in-strong-trend-lane on the same window vs. proposed `strong_bull_pullback` on the same window.
4. Output: `B65_5_BACKTEST_REPORT.md` with side-by-side metrics and pattern distributions.

**Deliverable gate (tightened per Langston Q3 refinement — new strategy demands higher bar than the Item 13 KEEP threshold the failed cohort couldn't clear):**
- WR ≥ **55%** on the historical replay
- sumR > **+5.0** on the historical replay
- Mean net % > **0%** (no break-even-pretending-to-work cases)
- Loser pattern distribution materially shifted away from the dominant Phase A failure mode
If any of those fail, the recommendation flips to DROP.

### Phase D — Optional build (conditional on Phases A–C all green)

**Goal:** ship the new strategy behind an A/B observation flag.

**Tasks:**
1. New strategy file `server/strategies/strong-bull-pullback.ts` (or extend `strategy-engine.ts` block per existing pattern — TBD with Langston).
2. Canonical map registration with own `tecConfig` (B65.1 module_constants entry rather than hard-coded). Mapped regimes: TREND_FRIENDLY_STABLE primary, IMPULSE_EXPANSION secondary.
3. A/B observation flag — initial deployment runs the new detector in shadow mode on VTS only, comparing per-pair entries against `vwap_pullback`-in-strong-trend-lane for one observation week before promoting to active. **The shadow strategy MUST register as its own canonical key `strong_bull_pullback`, NOT as a `vwap_pullback` variant** [Langston Q4 refinement] — clean telemetry separation from day one so cohort metrics, exit-reason mixes, and per-strategy WR are unambiguous in the Drift Dashboard and ML page from the first trade.
4. New scope+pre-audit+code-review+deploy follow the standard 11-step workflow.
5. Output: standalone batch (likely renumbered B65.6 or B72) with own scope, pre-audit, completion report.

**Alternative — DROP path:**
If Phases A–C recommend DROP, the deliverable is a single-line removal:
- `MULTI_FAMILY_ELIGIBILITY` map entry for `vwap_pullback` in `quant-strong_trend` source pool deleted.
- One-line governance commit on the canonical map.
- B65.5 closes with the DROP recommendation as its final artifact.
- `strong_bull_trend` carries the strong-trend lane alone going forward.

---

## 3. Files in scope (read-only for Phases A–C, write for Phase D)

**Read for analysis:**
- `paper_sim_trades` table (cohort pull)
- Per-pair OHLC archives + targeted Kraken REST fills
- `server/strategies/vwap-pullback.ts` (or relevant detector block in `strategy-engine.ts`) — current detector logic for comparison
- `server/services/strategy-engine.ts` (vwap_pullback block restructured by B63 DBS-B63B-002)
- `server/config/canonical-regime-strategy-map.ts` (`MULTI_FAMILY_ELIGIBILITY` map)
- `server/services/vts-runner.ts` (`strongTrendGeometryOverride` consumption, family-eligibility gate, first-claim-wins arbitration)

**Write only in Phase D (build path):**
- `server/strategies/strong-bull-pullback.ts` (new, if BUILD)
- `server/config/canonical-regime-strategy-map.ts` (registration if BUILD; entry removal if DROP)
- `drizzle/migrations/<date>-b65-5-add-strong-bull-pullback-strategy.sql` (module_constants seed if BUILD)
- Tests: `server/tests/unit/b65-5-strong-bull-pullback.test.ts` if BUILD

---

## 4. Out of scope (explicitly)

- **No changes to `strong_bull_trend`** — that strategy is performing fine in its lane and is the load-bearing strategy if the recommendation is DROP. Not touched.
- **No changes to other reversal/pullback strategies** (`morning_star`, `reverse_impulse`, `defensive_hedge`) — they're working in their assigned regimes and not in scope.
- **No changes to TEC, ladder, BE-protection, or trailing-engine** — B65.4 ladder ship is recent and stable; this batch does not touch the exit side of the system.
- **No changes to filter/scoring kernel** — those are governed by B66 Phase 19.4 SQE recalibration, not by B65.5.
- **No A/B framework build-out as new infrastructure** — if Phase D needs A/B shadow-running, we use the existing VTS pipeline as the shadow surface (VTS is by design a passive-learning shadow of paper/active). No new shadow-trading infrastructure built.

---

## 5. Decision points and gates

| Gate | Owner | Decision | Outcome if no |
|---|---|---|---|
| **Phase A0 routing** (NEW) | Langston (review) + Kyle (sign-off if non-trivial) | "Is sibling-strategy WR ≥ 50%, ≤ 30%, or 30–50% in the same windows?" | ≤30% → defer to Phase 19.5 AMR + flag future Item-13-reconsider batch, skip A/B/C/D. 30–50% → segment cohort, partial A. ≥50% → proceed to Phase A as planned. |
| Phase A pattern distribution clean enough | Langston (review) + Kyle (escalation if needed) | "Is there a single dominant loser category?" | Recommend DROP, skip B/C/D |
| Phase B hypothesis specifiable + falsifiable | Langston (review) | "Can this be coded as one rule?" | Iterate Phase A → B until specifiable |
| Phase C backtest meets BUILD thresholds (WR ≥ 55%, sumR > +5.0, mean net > 0%, pattern shift) | Langston (review) + Kyle (sign-off) | "Did the hypothesis hold on out-of-sample data?" | Recommend DROP, skip D |
| Phase D scope ready | Langston (review) + Kyle (approve) | "Is this a normal 11-step batch?" | Iterate scope until approved |

---

## 6. Workflow notes

- **CC ↔ Langston iteration on the loop without escalating every round to Kyle.** Per CLAUDE.md §6. Kyle only steps in at decision gates above.
- **Phases A and C produce written deliverables** (`B65_5_FAILURE_COHORT_PATTERN_AUDIT.md`, `B65_5_BACKTEST_REPORT.md`). Both go in `Claude Comms and Packages/Scope Files/` for Langston review.
- **Pre-audit (Step 2) deferred to Phase D** — Phases A–C are pure analysis with no code changes, so no pre-audit needed; SIM consultation only enters at Phase D when actual code lands.
- **Step-7 verification path differs by outcome:** if BUILD, normal staging deploy + paper observation. If DROP, single-line canonical-map removal + governance commit + done.

---

## 7. References

- `BATCH_63_COMPLETION_REPORT.md` §11 — Item 13 verdict block
- `BATCH_63_ITEM13_DECISION_GATE_SPEC.md` — pre-registered evaluation criteria
- `BATCH_63_COUNTERFACTUAL_AUDIT.md` — original n=19 baseline that motivated the B63 promotion
- `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` — module-extraction context for the strategy/filter dimension
- `POST_B62_PRE_LAUNCH_PLAN.md` Item 14 (added 2026-04-25) — pre-launch placement
- `POST_AUDIT_ROADMAP.md` queued sequence (revised 2026-04-25) — placement after B65.4 close, before Phase 19

---

## 8. Step-1 Langston review log

**Sent:** 2026-04-25 ~20:25 UTC via Telegram thread 21 + brain delivery (cc-inbox #819).

**Returned:** 2026-04-25 ~20:30 UTC. **APPROVED with 5 refinements** (all incorporated above):

| # | Langston refinement | Where applied |
|---|---|---|
| Q1 | Research-then-design framing correct — do NOT skip Phase A. B63's failure was exactly the skip this batch avoids. | §2 framing confirmed, no change |
| Q2 | Add 6th pattern category: "late entry — pullback already resolving" (price bottomed 3–5 candles before entry). Latency-related failure mode classified separately. | §2 Phase A bullet 2 |
| Q3 | Tighten Phase C BUILD threshold: WR ≥ 55% AND sumR > +5.0 AND mean net > 0%. New strategy demands higher bar than KEEP. | §2 Phase C deliverable gate + §5 decision-points table |
| Q4 | Shadow-via-VTS acceptable, but condition: own strategy key `strong_bull_pullback`, not a `vwap_pullback` variant. Clean telemetry separation from day one. | §2 Phase D bullet 3 |
| Q5 | Phase A must classify winners AND losers with same taxonomy. Discriminating signal lives in the comparison. | §2 Phase A bullet 3 |

**Status:** scope CLOSED, Phase A approved to begin.

---

*End of B65.5 scope. Step-1 Langston-approved 2026-04-25 (cc-inbox #819).*
