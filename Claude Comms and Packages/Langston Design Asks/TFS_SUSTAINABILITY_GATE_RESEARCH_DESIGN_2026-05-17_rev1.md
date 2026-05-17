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

### §3.1 Step 1 — Establish baseline on the current gate

**Source data:** VTS trade records, last 30-60 days (negotiate sample size with you). Use VTS (not active trading) because VTS produces the full family fan-out and includes the b68_5 ablation alternates.

**Metrics to compute** for the current gate (gate_admitted=true vs gate_admitted=false):

| Metric | Computation |
|--------|-------------|
| Gate-pass rate | trades where `gate_admitted=true` / total trades evaluated |
| Win rate of passers | wins among `gate_admitted=true` trades |
| Win rate of would-be-passers if gate disabled | wins among gate-eligible trades regardless of admit |
| **Regret rate** | wins among `gate_admitted=false` trades — the winners we filtered |
| **Save rate** | losses among `gate_admitted=false` trades — losers we correctly blocked |
| Net expectancy contribution | (Save rate × loss size) − (Regret rate × win size) |
| Δconf distribution | post-gate confidence delta among winners vs losers (parallel to B-NEW-37 finding) |

**Decision criterion at end of Step 1:**
- If gate's net expectancy contribution > 0 by meaningful margin → keep gate in some form (consider replace)
- If gate's net expectancy contribution ≤ 0 (or within statistical noise of 0) → drop is justified
- If gate is filtering winners more than losers → drop or replace strongly justified

### §3.2 Step 2 — Counterfactual evaluation of replacement candidates

**For each candidate gate (A, B, C, D from §1):**

1. Define the gate's pass/fail criterion mathematically (B68.2 modifier-as-gate semantics: choose a threshold, e.g. modifier > 1.0 = pass)
2. Apply the criterion to the same VTS trade records from Step 1
3. Compute the same metrics (pass rate, win rate of passers, regret rate, save rate, net expectancy)

**Candidate-specific notes:**

- **B (volume confirmation):** already exists as B68.2 continuous modifier. The gate version would be a thresholded version of B68.2. Question: what threshold? If we set it where it filters ~same fraction as current gate, what's the expectancy lift?
- **C (multi-TF agreement):** already exists as B68.1 continuous. Same thresholding question.
- **D (ATR extension):** not currently measured. Would need new code to compute ATR-extension per trade. For the counterfactual, can we approximate from existing OHLC fields, or do we need to add measurement first?

### §3.3 Step 3 — Tie-break criteria

In priority order:

1. **Net expectancy lift** vs current gate baseline. Highest wins. If two candidates are within statistical noise (define: bootstrap 95% CI overlapping), use criterion 2.
2. **Failure mode uniqueness** — does the gate catch a class of losing trades that no other current modifier catches? Score: count of "lost trades" that ONLY this gate would filter (i.e., not also filtered by B68.1, B68.2, or other modifiers).
3. **Implementation cost** — lower wins if expectancy lift is statistical noise apart. Code-paths-touched + new-DB-rows-needed.
4. **Risk of double-counting with existing modifiers** — if the candidate gate is essentially a binarization of a modifier we already apply continuously, the gate is duplicate signal. Score: correlation between gate's decision and the continuous modifier's value.

### §3.4 Step 4 — Decision

**Whichever option wins on §3.1 + §3.2 + §3.3 evidence gets the recommendation.** If §3.1 shows current gate's contribution ≤ 0 AND no replacement candidate produces a meaningful positive lift over no-gate, **drop wins by data.**

If a replacement candidate produces meaningful positive lift, **replace** with that candidate.

If two candidates are within statistical noise of each other AND both materially beat no-gate, **parallel** (run both, ablate over 14-30 days, pick the better one).

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

## §5 What happens after methodology is locked

1. You reply with revisions to §3 or answers to §4 (or "APPROVED — proceed as written").
2. CC pulls the VTS data, runs Steps 1 and 2, posts results to your inbox.
3. You and CC converge on Step 3 (tie-break application) and Step 4 (decision).
4. CC writes the decision summary as a plain-language Kyle-facing message + a technical-decision doc for the repo.
5. Kyle reviews. If approved, we scope a B-NEW-XX batch to implement the chosen approach. If not approved, we re-evaluate per his feedback.

**The decision is not made in this design ask. This document is just to lock the method.**

---

**Awaiting your review.** Reply with methodology revisions or APPROVED to proceed.
