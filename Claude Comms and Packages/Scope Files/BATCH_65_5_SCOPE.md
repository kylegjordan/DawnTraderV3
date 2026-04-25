# BATCH 65.5 — Strong Bull Pullback (Research → Design → Backtest → Optional Build)

**Status:** DRAFT (Step 1 — scope, awaiting Langston review)
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
   - Other (record and tally)
3. Same classification on the 12 winners — what did they have in common that the losers didn't?
4. Output: `B65_5_FAILURE_COHORT_PATTERN_AUDIT.md` with the loser/winner pattern distributions plus per-category sample trades.

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

**Deliverable gate:** for the BUILD recommendation to proceed, the proposed detector must show:
- WR ≥ 50% on the historical replay (the KEEP threshold for Item 13)
- sumR > 0 on the historical replay
- Loser pattern distribution materially shifted away from the dominant Phase A failure mode
If any of those fail, the recommendation flips to DROP.

### Phase D — Optional build (conditional on Phases A–C all green)

**Goal:** ship the new strategy behind an A/B observation flag.

**Tasks:**
1. New strategy file `server/strategies/strong-bull-pullback.ts` (or extend `strategy-engine.ts` block per existing pattern — TBD with Langston).
2. Canonical map registration with own `tecConfig` (B65.1 module_constants entry rather than hard-coded). Mapped regimes: TREND_FRIENDLY_STABLE primary, IMPULSE_EXPANSION secondary.
3. A/B observation flag — initial deployment runs the new detector in shadow mode on VTS only, comparing per-pair entries against `vwap_pullback`-in-strong-trend-lane for one observation week before promoting to active.
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
| Phase A pattern distribution clean enough | Langston (review) + Kyle (escalation if needed) | "Is there a single dominant loser category?" | Recommend DROP, skip B/C/D |
| Phase B hypothesis specifiable + falsifiable | Langston (review) | "Can this be coded as one rule?" | Iterate Phase A → B until specifiable |
| Phase C backtest meets BUILD thresholds (WR ≥ 50%, sumR > 0, pattern shift) | Langston (review) + Kyle (sign-off) | "Did the hypothesis hold on out-of-sample data?" | Recommend DROP, skip D |
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

*End of B65.5 scope draft. Sent to Langston for Step-1 review 2026-04-25.*
