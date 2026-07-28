# B-CALIBRATION-QUALITY-WEIGHT — Research Synthesis r1

**Owner:** CC-A · **Date:** 2026-07-28 · **Status:** for Kyle's scope call + Langston Step-1 review
**Trigger:** Kyle directive 2026-07-28 — *"let's find the right replacement… research online… see if the reputable trading firms or industry standards address this anywhere. Let's do this right and not wait."*
**Homes:** #591 (limb b, the calibration multiplier) · #593 (the AMR mis-identification note) · #588 (validated quality re-source, study-gated)

---

## 0. THE HEADLINE — THE RESEARCH CHANGED THE QUESTION

We asked: *"what replaces the retired `finalScore` quality term?"*

**The answer from both independent research strands is: nothing should replace it — and the question underneath it is more serious than the one we asked.** Three findings, in descending order of importance:

1. **★ THE SAMPLE SIZES ARE ROUGHLY TWO ORDERS OF MAGNITUDE SHORT.** Neither consumer has enough data to distinguish what it is choosing between. This dominates every formula question.
2. **Win rate is the wrong reward metric** — and #558 A2 has left BOTH consumers resting on *pure win rate*, which is the worst available resting state.
3. **A composite "quality" multiplier has no support anywhere in the literature.** It is an anti-pattern. Do not re-add one.

---

## 1. THE SAMPLE-SIZE FINDING (the one that matters)

Standard two-proportion power analysis, α=0.05 two-sided, 80% power:

| True win-rate gap | Trades needed **per group** |
|---|---|
| 20 pp (60 vs 40) | ~98 |
| **10 pp (55 vs 45)** | **~393** |
| **5 pp** | **~1,570** |
| 2 pp | ~9,800 |

Strand 1 computed the same thing for our exact thresholds: detecting a true 55% against a 50% null needs **n ≈ 780–800**.

**What we actually have:**

| Consumer | Its gate | What it needs | Short by |
|---|---|---|---|
| `ml-calibration.ts` (55/45 thresholds, 50-trade window) | ★ **NO SAMPLE GATE AT ALL** — `if (total === 0) continue` is the only guard, so it will emit a recommendation off **n=1** | ~393–780 | ~2 orders of magnitude |
| `adaptive-ratio-manager.ts` (`minSamples`) | **10** | ~393 (10pp) / ~1,570 (5pp) | ~1.5–2 orders of magnitude |

★ **THE ARITHMETIC THAT SETTLES IT (strand 1):** at n=50 with 55% observed, the 95% Wilson interval is ≈ **[0.40, 0.66]** — **it contains the 45% DECREASE threshold.** The rule fires "increase this pattern" on evidence statistically indistinguishable from the evidence that would justify decreasing it. **No multiplier fixes that; multiplying a noise estimate yields a scaled noise estimate.**

**Independently corroborated from three unrelated directions** — that convergence is why this is the load-bearing finding:
- two-proportion power analysis (textbook);
- Bacidore (ex-Head of Algorithmic Trading, ITG), *Algo Wheel of Fortune* — detecting a 5 bp execution difference at 50 bp SD needs **≈1,537 orders**; without that rigour the conclusions are *"no better than having chosen the best algorithm by spinning a wheel of fortune"*;
- bandit best-arm-identification lower bounds scale as **1/gap²** (Mannor & Tsitsiklis 2004; Kaufmann/Cappé/Garivier, JMLR 2016) — same scaling law from a completely different starting point.

**Michaud's "estimation-error maximizer" (FAJ 1989)** names the failure mode precisely: an optimiser allocating on *estimated* performance systematically over-weights whichever arm drew the luckiest estimate, **because a high estimate and a high estimation error are the same event.** That is exactly what a score-and-reallocate loop does at small n. It is not neutral — it is actively biased toward noise.

---

## 2. WIN RATE IS THE WRONG TARGET — AND WE ARE NOW RESTING ON IT

⚠️ **This is the sharpest practical consequence of #558 A2.** With the retired term zeroed, `adaptive-ratio-manager`'s pool score reduces to `winRate*0.6` on both sides; the shared factor cancels in the ratio, so **scan allocation is now decided by win rate ALONE.** Strand 2's verdict is blunt: *"dropping avgEdge leaves pure win rate — the single most manipulable and most misleading statistic available."*

Support (all peer-reviewed, all independent):
- **Goetzmann, Ingersoll, Spiegel & Welch, "Manipulation-proof Performance Measures," _RFS_ 20(5), 2007** — a measure is manipulation-proof only under conditions forcing it to look like average power utility; at ρ=1 that is exactly **log-growth / Kelly**. Win rate is the most gameable statistic in the set: you raise it by cutting winners short and letting losers run, for zero economic gain.
- **Lo, "Risk Management for Hedge Funds," _FAJ_ 57(6), 2001** — "Capital Decimation Partners": 41% compounded annual return, positive in *every* year, near-100% win rate, and a hidden short-volatility bomb. The canonical published counterexample.
- **Odean, "Are Investors Reluctant to Realize Their Losses?" _JF_ 53(5), 1998** — the disposition effect "is not justified by subsequent portfolio performance." **A win-rate-maximising objective installs the disposition effect as policy.**
- **Kelly (1956)**; MacLean/Thorp/Ziemba (2011) — maximise E[log W].
- **Moody & Saffell, _IEEE TNN_ 12(4), 2001** — the most on-point precedent for "what should the reward be" in trading RL: optimise a risk-adjusted measure **net of transaction costs**; beats naive return-maximising Q-learning.

★ **This also contradicts our own §0 mission statement — "the edge is selection, not frequency" — and our own EV/Net-Expectancy gate.** We gate entries on expectancy and then steer adaptation on hit rate. Those are inconsistent.

**RECOMMENDED REWARD: mean net log-growth per closed trade** — `mean of log(1 + r_net)`, r_net after friction. This is simultaneously the Kelly criterion and the ρ=1 manipulation-proof measure. **Two independent literatures converging on the same functional form is the strongest evidence available.**

---

## 3. THE COMPOSITE QUALITY MULTIPLIER IS AN ANTI-PATTERN — DO NOT RE-ADD ONE

Strand 1 searched specifically and found **no published method scaling a parameter adjustment by a composite subjective quality score.** The adjacent literature is actively critical:
- **Dawes, "The Robust Beauty of Improper Linear Models," _American Psychologist_ 34(7), 1979** — unit weighting is remarkably robust; elaborately-derived weights often fail out of sample.
- When components are positively intercorrelated — which a signal-quality score, a predictive-confidence value and a regime weight almost certainly are — unit weights correlate very highly with optimally-weighted composites, so differential weighting "rarely buys enough to justify its fragility across samples."

Strand 2 adds the structural objection: `winRate*0.6 + avgEdge*0.4` is **dimensionally incoherent** — a weighted sum of a probability and a magnitude on unrelated scales, with no decision-theoretic basis for 0.6/0.4.

★ **The conceptual error, stated plainly: a quality composite conflates *how good the setup looked* with *how much we actually know*. Only the second is a legitimate scaler for an adjustment derived from outcomes.**

⇒ **This retires #588's framing too.** #588 was homed as "a validated live quality signal may return later." The research says the term that belongs in that slot is **statistical confidence**, not a quality signal. #588 should be re-scoped or closed accordingly.

---

## 4. WHAT OUR EXISTING DESIGN ALREADY GETS RIGHT (do not rewrite these)

Strand 2 was explicit that `adaptive-ratio-manager` "accidentally reproduces principled structure." Preserve it:

| Our element | Verdict | Principled counterpart |
|---|---|---|
| Bounded `[0.3, 0.9]` | **SOUND in kind** — forced exploration, the same device as EXP3's `γ/K` uniform-mixing floor | Keep the concept. ⚠️ But it is **asymmetric about 0.5 with no stated rationale** — flag it. And a *fixed* floor spends 30% on the losing pool no matter how conclusively it loses (Russo et al.'s "failure to write off"). |
| Gradual adjustment rate | **SOUND in kind** — exponential smoothing = geometric forgetting, the correct response to non-stationarity | It is an undisciplined γ. Garivier & Moulines give a derived setting: `γ = 1 − (4B)⁻¹·√(Υ_T/T)`. |
| `confidence = min(1, n/100)`, shrink to default | **Ad-hoc but a NEAR-MISS of something real** — a linear approximation of Beta-posterior shrinkage | Exact form: data weight `n/(n+α₀+β₀)`. ⚠️ **Ours is ~2× too aggressive and hard-caps at n=100, thereby asserting ZERO estimation error beyond 100 — which is false.** |
| `ml-calibration`'s lack of any gate | **UNSOUND** | see §1 |

**The AMR core is untouched by all of this** (`amr-gates.ts`, `strategy-modes.ts`, `amr-weather-report.ts`, `amr-input-health.ts` — zero `finalScore` references, measured). This document does **not** bear on the AMR throttle.

---

## 5. THE UNCOMFORTABLE OPTION WE MUST PUT ON THE TABLE

**Performance-chasing reallocation may not work at all at our scale.**

- **Goyal & Wahal, "The Selection and Termination of Investment Management Firms by Plan Sponsors," _JF_ 63(4), 2008** — the closest published analogue to this exact decision. 3,400 plan sponsors, 1994–2003, reallocating toward observed outperformers. Return-chasing *"does not deliver positive excess returns thereafter,"* and **"if plan sponsors had stayed with fired investment managers, their excess returns would be no different from those delivered by newly hired managers."** The reallocation added nothing and cost transition expense.
- Carhart (1997): short-run "hot hands" is factors and expenses, not skill; the only robust persistence is in *bad* performers.
- Frazzini & Lamont, "Dumb money," _JFE_ 2008: reallocating toward recent winners is *negatively* predictive.
- DeMiguel, Garlappi & Uppal, _RFS_ 22(5), 2009: none of 14 optimising models consistently beat 1/N.

⇒ ★ **If per-group trade counts cannot realistically reach the hundreds, the honest answer is not a better algorithm — it is a FIXED SPLIT and no adaptation.** Strand 2 states this directly. A defensible middle path is **hierarchical pooling** (Markov, *Bayesian Trading Cost Analysis and Ranking of Broker Algorithms*, 2019) — transfer strength from the large aggregate sample to thin per-group samples, rather than trying to explore your way to significance.

---

## 6. IF WE DO ADAPT — THE RECOMMENDED ARCHITECTURE

Both strands independently identified this as a **multi-armed bandit** problem, and both recommended **Thompson Sampling**.

- **Algorithm:** discounted **Beta-Bernoulli** (or bounded-Gaussian) **Thompson Sampling**. Update `(α_k, β_k) ← (α_k + r_t, β_k + 1 − r_t)`; select by sampling `θ̂_k ~ Beta(α_k, β_k)` and playing the argmax. Play probability *is* the posterior probability of being best — wide posterior (few samples) explores automatically, narrow posterior exploits. **No confidence parameter to tune, because uncertainty is represented rather than approximated.**
- **Why TS over UCB here:** trades close with a lag, so feedback is **delayed and batched**. Chapelle & Li (NIPS 2011) show randomised TS is specifically **more robust than deterministic methods under delay**, because randomisation hedges the stale-estimate period whereas UCB commits.
- **Reward:** clipped, normalised mean net log-growth (§2) — **not** win rate. ⚠️ A Bernoulli formulation needs reward in [0,1]; binarising on `log-growth > 0` is *still win rate* and reintroduces the problem. Use bounded-Gaussian TS on clipped normalised log-growth.
- **Prior:** `Beta(m·p̄, m·(1−p̄))` with p̄ = pooled base rate and m ≈ 20–50 pseudo-trades. Not Beta(1,1); not Jeffreys.
- **Non-stationarity:** geometric decay of counts toward `(ᾱ, β̄)` set to the **desired default split**. ★ This makes *"revert to the default when evidence is stale"* a **property of the model rather than a bolt-on**, and replaces BOTH our confidence factor and our gradual adjustment rate with one parameter. Formal basis: Besbes/Gur/Zeevi (NeurIPS 2014) prove regret in a drifting environment is O(V^⅓T^⅔) — **you provably cannot get stationary-grade performance in a drifting market**, so the forgetting mechanism is mandatory, not optional.
- **Keep** an explicit allocation floor as a safety rail, but make it **symmetric** and justify the value.

### The minimal alternative (if we want one change, not an architecture)
```
p̂ = (w + k·μ) / (n + k)              # μ = pooled rate; k ≈ 50–100
adjustment = c · (p̂ − μ) · [ n / (n + k) ]
```
with `c` a global damping constant in the fractional-Kelly spirit (start ≤0.5), and **no threshold at all** — the shrinkage makes small-n groups **self-silencing**. Cites cleanly to Efron–Morris and Brown/Cai/DasGupta, removes three tuned inputs, and is **fewer lines than what it replaces**.

---

## 7. REGULATORY / STANDARDS POSITION (asked for explicitly)

- **FINRA Rule 5310** (Supplementary Material .09) is direct precedent for the **shape**: "regular and rigorous review" of execution quality **at minimum quarterly**, and where material differences appear the firm **"must modify the routing arrangements or justify why it is not."** ⚠️ Note what it is *not*: it prescribes **no statistical adequacy threshold**, and it is a **quarterly floor cadence** — not a mandate for a continuously self-adjusting allocator.
- **MiFID II RTS 6** (Reg. (EU) 2017/589) governs self-adjusting systems: Arts. 5–8 testing/conformance/controlled deployment, Art. 9 **annual self-assessment and validation**, Art. 12 **kill functionality**, plus change management and post-deployment surveillance. **This is the standard our adaptive machinery should be held to.**
- **FINRA Notice 15-09** — change-management tracking material code changes with review of test results; supervisory obligations continue *after* production.
- **IOSCO AI/ML Final Report (2021)** — designated senior management accountable for development, testing, deployment and monitoring.
- ★ **CFA Standard V(A), Diligence and Reasonable Basis** — the one that bites: **acting on a signal you cannot show is distinguishable from noise is acting without a reasonable basis.** That is a fair description of a 55/45 rule on a 50-trade window with no sample gate.
- **GIPS 2020** requires composites of **at least 5 years** plus 3-year ex-post standard deviation — every performance-measurement standard cuts against fast short-window reallocation.

**Status corrections worth recording (these changed recently):** SEC "Regulation Best Execution" was **WITHDRAWN** 17 June 2025. SEC Rule 605 amendments' compliance date is extended to **1 Aug 2026** (a disclosure rule — compels publication, not reallocation). **MiFID II RTS 27/28 have been DELETED** (Dir. (EU) 2024/790, Reg. (EU) 2024/791) — the Art. 27 best-execution duty itself survives.

---

## 8. RECOMMENDATION TO KYLE (decision required)

**Priority order — highest value first, which is NOT the order we started in:**

1. **★ FIX THE SAMPLE GATES FIRST. This outranks every formula question.** Give `ml-calibration` a minimum-sample gate (it has none, and will recommend off a single trade); raise `adaptive-ratio-manager`'s from 10 toward the power-analysis number for the smallest gap worth acting on. Until met, **hold the neutral default.** This is cheap, it is unambiguous, and it stops the systems amplifying noise **today**.
2. **Switch the reward from win rate to net log-growth** in both consumers (§2). Removes the §0 contradiction.
3. **Replace the ad-hoc confidence shrink with the Beta posterior weight** `n/(n+k)` (§4) — it *is* what our heuristic was approximating, minus the false zero-error claim beyond n=100.
4. **Do NOT re-add any quality composite** (§3), and re-scope or close **#588** accordingly.
5. **Decide explicitly whether adaptive allocation is worth it at our volumes** (§5). If per-group counts cannot reach the hundreds, a fixed split is the honest engineering answer and the literature supports it.
6. Only then consider the full Thompson Sampling architecture (§6).

**CC-A's recommendation:** do 1 immediately as its own small batch (it is a guard, not a redesign, and it is the one change that is unambiguously right under every scenario); take 2–4 through a design batch; put 5 to Kyle as a genuine strategic choice rather than an engineering default.

---

## 9. HONEST LIMITS OF THIS RESEARCH (recorded per rule 22 / §9.5)

**Do not let this document read as more settled than it is.**

1. **No literature exists on our exact problem** — bandit allocation of a *scanning/attention* budget across signal pools in trading. Nearest analogues are execution-venue allocation and online model selection. **The transfer is an inference, not a cited result.**
2. **No citable academic source for `E = p·avgWin − (1−p)·avgLoss`** as a trading maxim — practitioner blogs only. The *substance* is safe via Goetzmann/Kelly/Odean; the framing is not citable. **"Expectancy," "R-multiple" and "profit factor" have essentially no academic standing** (Van Tharp lineage).
3. **No standard, citable minimum trade count** exists. The 30/100/500 figures circulating are **blog folklore — do not cite them.** Only the power formula and López de Prado's MinTRL are authoritative.
4. **No named quantitative firm publishes a production bandit allocator**, and no firm's internal reweighting thresholds are public. Anything claiming to describe AQR/Two Sigma/Man AHL practice should be treated as speculation.
5. **Wilson-interval gating of trading-parameter changes is NOT documented practice.** Sound construction; presented as defensible engineering, not as precedent.
6. **Genuinely contested, presented as such:** full-Kelly *sizing* (Samuelson 1979 vs MacLean/Thorp/Ziemba); variance vs CVaR for risk-aware bandits; and — importantly — **whether theoretically-sound bandits actually beat simple heuristics in practice.** Kuleshov & Precup (2014) found simple heuristics "outperform theoretically sound algorithms on most settings by a significant margin"; Chapelle & Li (2011) found the opposite. **Switching to TS is not guaranteed to improve results.**
7. **Constant vs decaying step size under genuine non-stationarity is an open modelling choice**, not something the literature decides for us.
8. **Formulas the research could not verify verbatim against primaries** (PDF extraction failures): UCB1/UCB1-Tuned (Auer et al. 2002 — corroborated by two secondary sources), the Russo et al. non-stationary TS update line (descriptive text verified, equation reconstructed), and the exact DSR/MinTRL closed forms. ⚠️ **Verify before implementing.**
9. The one paper matching our framing exactly (Guo 2024, strategy selection via MAB) is **low quality — single author, non-recognised venue — and reports a NEGATIVE result** (MAB methods fail in adverse market environments, stationarity blamed). Not cited as authority; noted only because its negative finding agrees with Besbes/Gur/Zeevi.

---

## 10. QUESTIONS FOR LANGSTON

1. Do you agree the **sample-gate fix (§8 item 1) should be split out and shipped first**, ahead of any formula redesign?
2. Do you accept **net log-growth** as the reward, given it satisfies Kelly and manipulation-proofness simultaneously — and is it consistent with how the Net Expectancy kernel already computes things (i.e. can we source it without a new estimator)?
3. Is **§5 (possibly abandoning adaptive allocation)** a live option in your view, or do you consider our per-group volumes sufficient once the gate is raised?
4. Does anything here bear on **#590**'s calibration epoch boundary — specifically, does changing the reward metric constitute another predictor-formula change requiring the same clean-cutover treatment?
