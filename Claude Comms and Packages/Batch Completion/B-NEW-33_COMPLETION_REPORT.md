# B-NEW-33 — Crypto factor calibration backtest tool + cron unblock

**Status:** SHIPPED — drain completed, 10 factor verdicts produced (all INCONCLUSIVE), cron structurally fixed
**Date:** 2026-05-15
**Commit:** `892da2f27` (single commit; no hotfixes needed)
**PM2:** no restart required — out-of-band CLI tool, cron change exercised on next nightly run
**CI:** Build + Docker GREEN; TypeScript Check + Test Suite at pre-existing legacy baseline (no new failures introduced by this batch)

---

## SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

**This batch IS functional.** The CLI tool ran end-to-end on staging 2026-05-15: drained 33,049 pending rows in ~50 seconds, computed per-lever verdicts for all 10 crypto factors, wrote the report to `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md`. The cron at `npm run b67:replay-ablation` was restructured (not just patched) to use the shared core, so the nightly run from this point forward will:
- Hit the dual DB+JSONL source (post-B-NEW-33 canonical)
- Mark unmatched rows as `unreplayable_real_rejected` instead of leaving them pending forever
- Bound its workload to ~500 fresh rows per day (post-drain delta)

**No scaffolding-only pieces.**

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Previously stated | Now | Reason |
|---|---|---|
| Verification criterion 2: "Pending drops from 33,049 to <1000" | Reframed to "≥85% of matchable rows drained" (Langston condition 2) | Pre-B79.0g-tx closed trades were hard-deleted from DB; only JSONL retains them. Realistic target = matchable ratio. **Actual result:** 13,830 / (13,830 + 19,219) = 41.8% raw drained, but 100% of pending rows are now marked (matched OR unreplayable). Cron's pending-row pileup is zero from this point. |
| Verification criterion 4: "At least 6 of 10 factors reach decision-grade" | **0 of 10 factors decision-grade. All INCONCLUSIVE.** | Real result. Data is sufficient (n≥1800 per factor) but tertile-WR spreads are below the 7pp gate (1.0pp - 4.2pp range). Tertile WRs are non-monotonic (mid > high) suggesting confidence clustering or non-linear factor effects. See "Findings" below for interpretation. |
| Time window assumption: "30-day cohort" | Actual: ~16 days (2026-04-30 → 2026-05-15) | Cohort is younger than the master-plan 30-day cadence. B-NEW-33 acted on the data as it stands; the next cohort run can use the full 30-day window after another two weeks of emit. |

---

## Workflow checkpoints

| Step | Deliverable | Status |
|---|---|---|
| 1 | `B-NEW-33_SCOPE.md` | DONE |
| 2 | `B-NEW-33_PRE_AUDIT.md` (with SIM consult + Langston-condition amendments) | DONE |
| Langston review | APPROVE with 4 implementation conditions | DONE — all 4 conditions reflected |
| 3 | Implementation: `factor-replay-core.ts`, CLI tool, cron refactor, unit tests | DONE — 4 files |
| 4 | Langston code review pre-push | Implicit (Langston explicitly said "no second pass before implementation; just amend and push") |
| 5 | CI green | Build + Docker GREEN |
| 6 | Staging deploy | `git pull` on staging, no PM2 restart needed |
| 7 | Run + first-pass verification | DONE — drain stats + verdict report captured |
| 8 | Langston Step 8 independent review | DONE — 4 Step 8 questions sent + relayed verbatim |
| 10 | Governance updates (this batch) | IN PROGRESS — completion report + CHANGES_AND_FIXES entry |
| 11 | Final close after Kyle ack | PENDING |

---

## Files changed

**New:**
- `server/services/factor-replay-core.ts` — shared replay logic (dual-source matcher, outcome payload builders, classifier)
- `scripts/b-new-33-factor-backtest.ts` — one-shot CLI tool (drain phase + analyze phase + report phase, plus `--dry-run-synthetic` negative-control)
- `server/tests/unit/b-new-33-factor-replay-core.test.ts` — unit tests for the four pure functions + synthetic-noise verdict check
- `Claude Comms and Packages/Scope Files/B-NEW-33_SCOPE.md`
- `Claude Comms and Packages/Scope Files/B-NEW-33_PRE_AUDIT.md` (amended with Langston's 4 conditions)
- `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md` (CLI output)
- `Claude Comms and Packages/Batch Completion/B-NEW-33_COMPLETION_REPORT.md` (this file)

**Modified:**
- `server/scripts/replay-ablation.ts` — refactored to consume `factor-replay-core.ts`; unmatched rows now MARKED `unreplayable_real_rejected` with diagnostics instead of left pending
- `package.json` — added `b-new-33:factor-backtest` script entry

**No DB schema changes.**

---

## Drain statistics

- Pending rows pre-drain: 33,049
- Pending rows post-drain: **0**
- Total replayed: 40,642 (= prior 7,593 + new 33,049)
- Matched in this run: 13,830 (41.8% of newly-processed rows)
- Unmatched, marked `unreplayable_real_rejected`: 19,219 (58.2%)

**Match source breakdown** (sampled from `replay_outcome.source` field on matched rows):
- DB primary (`vts_open_trades WHERE closed=true`): ~549 closed-trade entries indexed, sourcing ~10% of matches
- JSONL fallback (`logs/virtual_trades/*.json` last 30 days): ~4,238 closed-trade entries indexed, sourcing ~90% of matches

**Outcome distribution across all 40,642 rows:**
- `unreplayable_real_rejected`: 19,219 (47%)
- `admitted_breakeven`: 9,594 (24%)
- `admitted_lost`: 7,272 (18%)
- `admitted_won`: 4,557 (11%)

Overall WR among matched rows = 4,557 / (4,557 + 7,272 + 9,594) = 21.3%. Consistent with the per-tertile WRs in the verdict table (low ~17%, mid ~26%, high ~21%).

---

## Per-lever verdicts (summary)

All 10 crypto factors: **INCONCLUSIVE**. See `B-NEW-33_VERDICTS.md` for the full table. Key observations:

| Pattern | Factors affected | What it means |
|---|---|---|
| Real spread < 7pp gate | 8 of 10 | The high-tertile WR is not meaningfully above the low-tertile WR. Confidence signal is weak or non-monotonic. |
| Mean abs confidence shift < 0.01 (dormant) | 2 of 10 (`b67_1_funding_rates`, `b67_1_mcap_momentum`) | These two sub-levers of the macro modifier are barely moving the chain-final confidence. |
| Non-monotonic tertile WRs (mid > high) | All 10 | Mid-confidence wins more than high-confidence across the board. Suggests confidence values cluster, or the high-confidence bucket includes a tail of bad signals that the live system shouldn't have rated highly. |
| Predictive lift negative | 1 (`b68_5_path_b_sustainability`, lift = -6.1pp) | Real spread (3.5pp) is LOWER than alt spread (9.5pp) — disabling the lever actually IMPROVES the predictive signal. With more cohort data this could cross to a decision-grade DROP. |

---

## What this means for B67.5 — Langston Step 8 verdict (RECEIVED 2026-05-15)

**Langston's call: HOLD thresholds, do NOT relax. Wire zero factors into consumer gates this cycle.** Per his Step 8 review (verbatim relayed to Telegram thread 21):

> "The big finding the report glosses over: look at the tertile WRs across all 10 factors. Low ≈ 17%, mid ≈ 25%, high ≈ 20%. Every single factor. That's not 10 independent signals — that's one underlying artifact showing up everywhere. The middle tertile wins universally. Before B67.5 consumer-gate design, this needs a root cause."

**Concrete recommendation:**
1. **All 10 factors stay shadow-only this cycle.** No consumer-gate wiring.
2. **Spawn a diagnostic spike (B-NEW-36) BEFORE B67.5 ships,** covering two hypotheses:
   - (a) Base confidence distribution has non-monotonic relationship with outcome — high-confidence signals may be routed into thinner-liquidity contexts where realized WR degrades.
   - (b) The 13,830 matched cohort is selection-biased — what survives the replay match isn't a representative sample.
3. **Audit the 58% unmatched rate** by grouping the 19,219 unreplayable rows by (symbol, hour-of-day, day-of-week, signal direction, strategy). If lopsided, the matched cohort is biased and every calibration in this run is suspect.
4. **Flag b68_5 as "over-active, mis-calibrated", NOT a DROP.** It's the ONLY factor doing real work (mean |Δconf|=0.43 vs others 0.001-0.02). Real spread is still +3.5pp positive (high > low) — the shape is mis-calibrated, not inverted. Right action: apply a ~0.37 multiplier (= 3.5/9.5) or cap its allowed confidence shift, re-measure next cycle. But ONLY after the non-monotonicity diagnostic resolves.
5. **Re-run B-NEW-33 after B-NEW-36 lands.** If the tertile shape resolves to monotonic post-diagnostic, several factors that look INCONCLUSIVE today might cross the 7pp gate cleanly.

**Langston bottom line:** "This run did its job — it stopped a calibration we weren't ready to make. The right move is to investigate why the data has the shape it does, not to relax the gate so something passes."

**B-NEW-36 spawned** via `mcp__ccd_session__spawn_task` 2026-05-15: "Tertile non-monotonicity + 58% unmatched audit" — full prompt captured in spawned-task chip.

---

## Cron health (post-restructure)

The nightly `b67:replay-ablation` cron now:
- Indexes both DB (`vts_open_trades WHERE closed=true`) AND JSONL files
- Marks unmatched rows as `unreplayable_real_rejected` after one pass
- Will process ~500 fresh emissions per day (the system's typical daily ablation-row output post-drain)
- Cron's `LIMIT 5000` retained — at ~500 rows/day workload, that's a 10× safety margin

**Hand-off to ops:** monitor `/var/log/dawntrader/replay-ablation.log` for next 3 nights. Expected pattern:
- `Pending rows: vts_trade=~500` (down from 33,049)
- `matched=~150-200 unmatched=~300-350` (the natural ratio of rejected signals)
- `Done. pending_vts=0` after the run completes (delta-only processing)

Any deviation flags a cron-side regression.

---

## Crypto regression check

**NONE.** The CLI tool runs out-of-band (as `tsx` subprocess, not inside PM2 dawntrader process). The cron refactor is structural — same matching tolerance, same outcome taxonomy, same write semantics. The only behavior changes are:
1. Reads BOTH DB and JSONL (was: JSONL only)
2. Marks unmatched as unreplayable (was: left pending)

Neither changes the row shape consumed downstream by `computeFactorCalibration` in `drift-dashboard-aggregator.ts`. The `/api/analytics/factor-calibration` endpoint and UI panel work unchanged. Live scanner/VTS/ablation-emit cycles untouched.

---

## Parity check — methodology validation (Kyle directive 2026-05-15 evening)

After the initial all-INCONCLUSIVE verdict, Kyle flagged that the existing Factor Calibration UI panel had been showing meaningful results for 5-6 levers before the cron stalled. Concern: had the calculation methodology drifted from the canonical aggregator?

**Action:** built `scripts/b-new-33-parity-check.ts` to run BOTH calculations (existing `computeFactorCalibration` aggregator + B-NEW-33 CLI) against the SAME pre-drain row set (7,593 rows replayed by the cron pre-stall). Output filed at `Claude Comms and Packages/Batch Completion/B-NEW-33_PARITY_CHECK.md`.

**Findings:**

1. **Confidence-shift values (top table of the UI panel): IDENTICAL.** Side-by-side with a May 5/6 screenshot Kyle provided showed exact-match agreement on `avg |shift|` per factor (e.g. b68_5 = 0.4457 in the screenshot vs 0.4456 in my parity check; b68_4 = 0.0149 in both). The 5-6 "actively moving" levers Kyle remembers are still active in the data with the same magnitudes.

2. **Predictive-lift values: same direction and similar magnitude with small numerical differences explained by cohort-size delta** (screenshot was from a ~700-row-per-factor cohort; my pre-drain analysis included rows through May 10 ≈ 800-850 per factor). Where lifts differ: b68_5 went from -1.8pp (screenshot) to -4.1pp (mine) — the harmful-lever finding STRENGTHENED with more data. b68_1 went from +5.7pp to +8.5pp — positive lift held up.

3. **Verdict-labeling logic differs at the gate threshold, NOT at the calculation.** The May 5/6 screenshot uses approximately a +3pp lift floor as "DECISION-GRADE WIN". My CLI applies Langston's locked 7pp gate + p<0.05. Per Langston B-NEW-33 scope-review approval 2026-05-15 morning: "n≥150 / |spread|≥7pp / p<0.05 approved. Lower n risks false positives; lower spread is operationally noisy. Binomial 95% CI half-width ≈ 8pp around WR=0.5 at n=150 supports the 7pp floor."

**Kyle decision 2026-05-15 evening: HOLD the 7pp gate (Option 1).** All 10 factors stay INCONCLUSIVE per the strict gate. B-NEW-36 diagnostic spike runs FIRST. B67.5 wires nothing this cycle. The relaxed-gate path (which would have graduated 5 factors to KEEP) was REJECTED — the operational discipline of not shipping potential noise into the consumer chain takes precedence over the "ship something" pressure.

## Sign-off

CC: Implementation done, staging-verified, drain successful, verdict report generated and committed. Parity check confirms methodology is sound (confidence-shift values match the May 5/6 cohort exactly). Plain-language summary delivered to Kyle. B-NEW-36 diagnostic spike spawned per Langston Step 8 recommendation.

Langston: Steps 1-2 + 4 APPROVE with 4 conditions (all reflected). **Step 8 verdict: HOLD thresholds + spike B-NEW-36 first + re-run B-NEW-33 post-spike.** Verbatim relayed to Telegram thread 21.

Kyle: ack — B67.5 design blocked on B-NEW-36 (tertile non-monotonicity + unmatched-rate audit). The framework works; the data revealed a structural artifact that needs a one-batch diagnostic before consumer-gate design proceeds.

## Verdict file

Full per-lever table at `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md`.
