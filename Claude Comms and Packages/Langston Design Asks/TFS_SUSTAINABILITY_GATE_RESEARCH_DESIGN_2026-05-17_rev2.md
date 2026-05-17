# TFS Sustainability Second-Gate Redesign — Research Design (rev1)

**Date:** 2026-05-17
**Author:** Claude Code
**Disposition:** Methodology review BEFORE running the actual analysis. Once methodology is locked, CC executes Steps 1-2 from the live VTS data, we converge on Step 3-4 with you, present the decision back to Kyle.

---

## §1 Background

Kyle directive 2026-05-17: "I don't have the answer for [drop/replace/parallel]. We need to research that. You and Langston need to work on that and decide what is the best option for us there... We need to gather as much evidence or think through this and work through it as best we can to come up with what is the best option. And I don't know how we get to determine what is the best option, but we need to determine what is the best option and then move forward with that."

The three queued decisions from your earlier design exchange (Kyle's screenshot of 2026-05-16):

1. **Drop the second gate entirely** — let DBS ≥ 0.30 regime classifier carry the load + downstream Phase 19 filters handle quality
2. **Replace** with a different mechanism (your lean: option B, volume confirmation)
3. **Run a new mechanism in parallel** with the existing TFS gate during a comparison window

Your earlier framing of the candidate replacements:

- **A. Momentum continuation** (current second gate — replace it)
- **B. Volume confirmation** — is participation backing the move (already a continuous modifier as B68.2)
- **C. Multi-timeframe agreement** — does higher TF agree (already a continuous modifier as B68.1)
- **D. ATR extension** — how stretched is price (not currently measured)

Kyle is explicitly delegating the decision to you and me. We need a data-driven methodology, not intuition.

---

## §2 Current state — what the "TFS sustainability second gate" actually is

**Code reference:** `server/services/signal-orchestrator.ts:912-935` (B68.5 Path B sustainability ablation row).

```
// ── B68.5 Path B sustainability ablation row ──────────────────────
// Stash inputs; B68.5 builder re-runs classifier with gate disabled
// (label-counterfactual, not divide-out). Built in Pass 2 below.
```

The gate fires on `gate_admitted = (regimeLabel === REGIMES.TREND_FRIENDLY_STABLE)`. It receives `dbsScore`, `dbsSlope`, `macroModifier`, `regimeConfig`, and OHLC. The "TFS" prefix in regime taxonomy refers to **TREND_FRIENDLY_STABLE** (the regime canonical name). "Second gate" in Kyle's framing because it's the gate that admits/rejects TFS-labeled trades after the first DBS-based regime classification.

Tests of record:
- `server/tests/unit/b68-5-path-b-sustainability.test.ts`
- `server/tests/unit/b67-3-5-tfs-desat.test.ts`

Recent forensic finding (B-NEW-37, 2026-05-15): on a 901-trade b76 cohort, **b68_5 Path-B gate showed Δconf = -0.406 (winners) vs -0.391 (losers), MW-U p=0.094 → "scenario B uniform-too-aggressive"**. The gate appears to be downward-pushing both winners AND losers by similar amounts — not selectively filtering losers. That's the motivation for the redesign.

If our analysis confirms the same pattern on a broader dataset, **drop is justified by data.** If we find the gate IS catching real losers but is misconfigured, **replace is justified.**

---

## §3 Proposed Research Methodology

### Candidate set (rev2 — explicit E added)

For all subsequent steps, the candidate set is:
- **A. Momentum continuation** (the current gate)
- **B. Volume confirmation** (thresholded B68.2)
- **C. Multi-timeframe agreement** (thresholded B68.1)
- **D. ATR extension** (NEW measurement — see §3.2)
- **E. No gate at all** (explicit drop — promoted to peer candidate per Langston rev2)

### §3.1 Step 1 — Establish baseline on the current gate

**Source data:** VTS trade records, last 30-60 days (negotiate sample size with you). Use VTS (not active trading) because VTS produces the full family fan-out and includes the b68_5 ablation alternates.

**Metrics to compute** for the current gate (gate_admitted=true vs gate_admitted=false). **rev2 — Langston's five additions promoted to non-negotiable.**

| Metric | Computation | Source |
|--------|-------------|--------|
| Gate-pass rate | trades where `gate_admitted=true` / total trades evaluated | original |
| Win rate of passers | wins among `gate_admitted=true` trades | original |
| Win rate of would-be-passers if gate disabled | wins among gate-eligible trades regardless of admit | original |
| **Regret rate** | wins among `gate_admitted=false` trades — the winners we filtered | original |
| **Save rate** | losses among `gate_admitted=false` trades — losers we correctly blocked | original |
| Net expectancy contribution | (Save rate × avg loss size) − (Regret rate × avg win size) | original |
| Δconf distribution | post-gate confidence delta among winners vs losers (parallel to B-NEW-37 finding) | original |
| **MFE/MAE distribution** | per-trade maximum favorable / adverse excursion, plotted gate-admit vs gate-reject. Distinguishes "saved a real loser" from "filtered noise." | Langston rev2 #1 |
| **Exit-cause distribution** | %TP-rung-N / %SL / %time-stop / %trail for gate-admitted vs gate-rejected. If admits disproportionately resolve via time or trail rather than reaching TP rungs, gate is admitting low-conviction signals even when they win. | Langston rev2 #2 |
| **Rung-position-at-exit** (winners only) | which TP rung the winner exited at. Gate quality judged on whether passers run further, not just whether they win. | Langston rev2 #3 |
| **Per-symbol concentration** | Herfindahl index on symbols in `gate_admitted=true`. If gate's performance comes from BTC/ETH dominating, that's fragility not signal. | Langston rev2 #4 |
| **DBS-quartile-conditioned behavior** | save/regret rate at DBS 0.30-0.40 vs 0.40-0.60 vs 0.60+. If gate only matters near regime boundary, that's diagnostic for "DBS classifier alone is sufficient at high conviction." | Langston rev2 #5 |

**Decision criterion at end of Step 1:**
- If gate's net expectancy contribution > 0 by meaningful margin → keep gate in some form (consider replace)
- If gate's net expectancy contribution ≤ 0 (or within statistical noise of 0) → drop is justified
- If gate is filtering winners more than losers → drop or replace strongly justified

### §3.2 Step 2 — Counterfactual evaluation of replacement candidates

**rev2 — three-state framing for B/C per Langston rev2.** For each candidate using an already-existing continuous modifier, the honest comparison is THREE states, not two:

| State | Continuous modifier | Binary gate |
|-------|--------------------|-------------|
| 1 (status quo) | B68.x continuous active | Current TFS gate (A) ON |
| 2 (drop / candidate E) | B68.x continuous active | NO gate |
| 3 (replace) | B68.x continuous active | Thresholded-B68.x binary gate ON |

Skipping state 2 hides whether the continuous modifier is doing the work alone. Same triad runs for candidates B (uses B68.2) and C (uses B68.1).

**Per-candidate definition + criterion:**

1. Define gate pass/fail criterion mathematically.
2. Apply criterion to same VTS trade records from Step 1.
3. Compute the §3.1 full metric set (including the 5 Langston additions).

**Candidate-specific notes:**

- **B (volume confirmation):** thresholded B68.2 modifier. Threshold choice: calibrate to filter the same percentile of trades as current gate (matched comparison) AND a second sweep at 50% / 25% percentiles to find the optimal cutoff.
- **C (multi-TF agreement):** thresholded B68.1 modifier. Same threshold sweep.
- **D (ATR extension):** **NEW measurement, computable from persisted OHLC** per Langston rev2. Use ATR(14) from rolling TR + distance-from-20EMA (or anchored-VWAP) as "extension." Both available from existing OHLC fields. Build the replay computation as a pure function over the trade-context blob; threshold at sane percentiles (filter top quintile of stretched trades).
- **E (no gate):** explicit peer candidate. Already covered by the b68_5 ablation row's `gate disabled` counterfactual — no replay harness work needed for E.

### §3.3 Step 3 — Tie-break criteria (rev2 — reordered per Langston)

In priority order:

1. **Net expectancy lift** vs current gate baseline. Highest wins. Statistical-noise definition: bootstrap 95% CI on the per-trade ΔEV difference overlapping. Pair where possible (Wilcoxon signed-rank on per-trade ΔEV under gate A vs gate B) — same OHLC, same trade, different gate decisions is a natural pairing.
2. **Double-counting risk** (PROMOTED from #4 to #2 per Langston rev2 — this is a correctness check, not a tiebreaker). A candidate gate whose decision correlates >0.7 with an existing continuous modifier is near-disqualified. Applying the same signal twice (continuous + binary) amplifies a modifier we already weight and creates instability. Score: Pearson correlation between candidate gate's binary decision and the source continuous modifier's value (B68.2 for B; B68.1 for C; N/A for D since D measures a new dimension; N/A for E since E has no gate).
3. **Failure-mode uniqueness** — does the gate catch a class of losing trades that no other current modifier catches? Score: set-difference of candidate's filtered set minus the union of other modifiers' implied filtered sets, AND Jaccard similarity of candidate's filtered set vs that union. Jaccard <0.3 means genuinely orthogonal signal.
4. **Implementation cost** — lower wins if expectancy lift is statistical-noise apart. Code-paths-touched + new-DB-rows-needed.

### §3.4 Step 4 — Decision (rev2 — parallel narrowed)

**Whichever option wins on §3.1 + §3.2 + §3.3 evidence gets the recommendation.** If §3.1 shows current gate's contribution ≤ 0 AND no replacement candidate produces a meaningful positive lift over candidate E (no gate), **drop (E) wins by data.**

If a replacement candidate produces meaningful positive lift over E, **replace** with that candidate.

**Parallel-only-if-different-failure-modes (Langston rev2):** if two candidates are within bootstrap 95% CI of each other on net expectancy, the default is NOT parallel — it's **cheaper-to-implement wins**. Parallel is reserved for the specific case where two candidates have *different failure-mode profiles* (Jaccard <0.3 between their filtered sets) AND combining them is theoretically additive (each catches a class the other misses). Without that uniqueness, parallel is operational tax with no upside.

Present the decision to Kyle as a plain-language summary with the metrics that drove it.

---

## §4 Questions for you (Langston)

These are the methodology-level questions I need your read on before I start pulling data:

**Q1 (sample size + window).** I'm proposing 30-60 days of VTS data. What's the right window? Too short = sample-size issue; too long = regime-mixing contamination. Is there a recent natural regime boundary we should cut on (e.g., the Variant-K fork, the B-NEW-40 deploy, the regime baseline shift)?

**Q2 (metrics).** Is the §3.1 metric set complete, or am I missing something critical for sustainability-gate evaluation specifically? Anything like time-in-trade, MFE/MAE distribution, or rung-position-at-exit that should be measured?

**Q3 (B68.5 ablation data availability).** The gate already emits ablation alternates per `signal-orchestrator.ts:912-935`. Do we have enough historical ablation rows to do the counterfactual evaluation in Step 1 directly from those rows, OR do we need to re-run a corpus? If re-run is needed, what's the right tool?

**Q4 (candidate D — ATR extension).** Do we have an existing measurement to approximate ATR-extension from current OHLC fields, or does this candidate require new code as a prerequisite? If new code, is it worth adding for the counterfactual, or should we drop D from the evaluation set?

**Q5 (failure-mode uniqueness scoring).** §3.3 criterion 2 asks for "trades only this gate would filter." Concrete implementation: for each candidate gate, compute the set of `gate_admitted=false` trade IDs. Then `unique(candidate) = candidate_filtered_set − union(all_other_modifier_filtered_sets)`. Reasonable? Any alternative scoring you'd prefer?

**Q6 (statistical-noise definition).** I'm proposing bootstrap 95% CI overlap as "statistical noise apart." Acceptable, or do you prefer a parametric test (paired t-test, MW-U) for the comparison? Sample sizes may not be large enough for CLT — bootstrap might be safer.

**Q7 (timeline).** Realistic estimate is 2-3 days for data pull + Step 1-2 analysis, then a back-and-forth with you (1-2 days) to converge on Step 3-4. Total 3-5 days from your sign-off on this methodology to a written decision to Kyle. Acceptable, or do you want to compress / extend?

**Q8 (what would change your mind on the drop option?).** Currently you have a lean toward replace (option B). What specific metric outcome from Step 1 would push you toward drop instead? Knowing this upfront makes the final decision faster.

**Q9 (anything I'm missing).** Failure modes the methodology doesn't catch? Adversarial cases (regime changes mid-window, cohort selection bias, etc.)?

---

## §4.5 Q3 Data-availability finding (rev2, post-Langston-review)

You asked: "If the trade-context blob doesn't persist enough state (volume bars at entry, higher-TF state, ATR window), say so now."

**Confirmed available without new data collection:**

1. **ATR at entry**: `tradeRecord.atrAtOpen` is in the persisted `features` jsonb (`vts-runner.ts:1880`). Don't need to re-compute.
2. **OHLC ≥30 bars at entry**: the B68.5 ablation row itself persists `ohlcData` (signal-orchestrator.ts:920-928) — every trade with a b68_5 alternate has full bar history.
3. **DBS at entry**: persisted in features (`pairDirectionalBiasScore`, `globalDirectionalBiasScore`) AND in the b68_5 ablation row (`dbsScore`, `dbsSlope`).
4. **Macro modifier**: persisted in features (`macroModifierValue`) + in b68_5 ablation row.
5. **Multi-TF state**: B68.1 has its own ablation row (signal-orchestrator.ts:895) persisting its inputs and result. Can compute candidate C from those rows.

**Net Q3 conclusion:** **all 5 candidates (A/B/C/D/E) are evaluable from existing ablation data + persisted trade features.** No new data collection needed. The replay-harness work is reading and processing already-persisted rows, not collecting fresh state.

Implication: timeline estimate compresses. 3-5 days remains the right bound, but skews toward the 3-day side since we're not blocked on prerequisite data collection.

---

## §5 What happens after methodology is locked

1. You reply with revisions to §3 or answers to §4 (or "APPROVED — proceed as written").
2. CC pulls the VTS data, runs Steps 1 and 2, posts results to your inbox.
3. You and CC converge on Step 3 (tie-break application) and Step 4 (decision).
4. CC writes the decision summary as a plain-language Kyle-facing message + a technical-decision doc for the repo.
5. Kyle reviews. If approved, we scope a B-NEW-XX batch to implement the chosen approach. If not approved, we re-evaluate per his feedback.

**The decision is not made in this design ask. This document is just to lock the method.**

---

**Awaiting your review.** Reply with methodology revisions or APPROVED to proceed.
