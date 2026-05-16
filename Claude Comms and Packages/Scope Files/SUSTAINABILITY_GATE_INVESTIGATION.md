# Sustainability Gate Redesign — Investigation & Recommendations

**Date:** 2026-05-16
**Owner:** CC (investigation), Kyle (decision)
**Trigger:** Both prior versions of the trend-sustainability second gate (DBS slope, then momentum) shown to be non-predictive in calibration data. Need a structural decision: drop the second gate, or replace its measurement with something orthogonal to direction.

---

## 1. What the second gate is for, in plain language

When a pair clears the regime classifier and gets labeled as a "trend-friendly" pair, that label is based on the directional bias score being strong enough (absolute value ≥ 0.30). That tells us **which way price is leaning and how strongly right now**.

What it doesn't tell us:
- Is this trend fresh, or has it been running so long it's about to exhaust?
- Is volume confirming the move, or is price drifting up on no participation (a classic exhaustion pattern)?
- Is this directional bias coherent across higher timeframes, or is it a short-term blip inside a larger sideways pattern?
- Is price extended too far from its average to keep going without a pullback?

The original idea of a second gate was: even after the regime says "yes this is trending," apply an additional sanity check that captures one of those orthogonal questions before letting strong-trend strategies fire on it. The two attempts so far (slope, momentum) both measured a flavor of "is direction continuing right now," which is the SAME thing the directional bias score is already measuring — so the second gate has been double-counting direction rather than capturing anything new.

---

## 2. Why each attempt so far failed

**Attempt 1: DBS slope (the rate of change of the directional bias score).**
- Calibration showed −2.0 percentage points predictive lift (actively hurting outcomes).
- Average chain shift: −0.4480 (cutting confidence ~45 points on every trend signal).
- Why it failed: slope is a derivative. A healthy trend regularly spends time with a temporarily negative slope when it consolidates before continuing. The slope gate was binary-rejecting those healthy consolidations.

**Attempt 2: Forward momentum check (B70.3, May 5).**
- Calibration shows uniform −0.40 confidence drag (winners and losers both pulled down ~0.40, p-value 0.094 = not significantly different).
- Why it failed: momentum and DBS measure essentially the same thing at different time scales. So the gate was applying a near-binary "is direction firm right now" check on top of a "is direction firm right now" regime gate. It rejected signals proportionally to instantaneous direction strength rather than to sustainability.

**The pattern:** both attempts measured direction. Direction is already the regime gate's job. The second gate keeps failing because it isn't measuring something genuinely different.

---

## 3. What "sustainability" could structurally mean

Four candidate dimensions, each genuinely orthogonal to "is this trending right now":

### A. Trend age / maturity
"How long has this pair been in this trend regime?"

A pair that just transitioned into TFS is in fresh-trend territory — the trend is young and statistically more likely to continue. A pair that's been in TFS for 36 hours straight is in late-trend territory — exhaustion is more likely. This is a freshness signal in the truest sense.

Already partially measured: the regime-age confidence modifier (B68.4). It's currently a continuous confidence adjustment, not a gate. We could either upgrade it to play double-duty as the second gate (when regime age exceeds threshold X, downgrade), or build a parallel binary gate from the same underlying age measurement.

### B. Volume confirmation
"Is price moving WITH or WITHOUT participating volume?"

Healthy trends ride above-average volume. Price drifting up on declining volume is distribution — sellers leaning out of the move. Empirically this is one of the most-cited human-trader signals for trend exhaustion.

Already partially measured: the volume-regime confidence modifier (B68.2). Same situation as regime-age — currently a continuous modifier, could be promoted to gate duty.

### C. Higher-timeframe agreement
"Does the higher timeframe show the same directional bias, or is this a low-timeframe blip inside a larger sideways pattern?"

A pair showing UP_STRONG on the 5-minute but NEUTRAL on the 1-hour is structurally weaker than a pair showing UP_STRONG on both. Multi-timeframe alignment IS a sustainability signal.

Already partially measured: the multi-TF agreement modifier (B68.1). Continuous modifier today.

### D. ATR-relative extension
"How far has price moved relative to its recent volatility, and is that distance reasonable or stretched?"

Price that's run 8 ATRs in a straight line is statistically more likely to mean-revert than continue. Price that's run 2 ATRs is mid-move territory. The further price is from its anchor (VWAP, MA, breakout level), the lower the probability of continuation per unit time.

Not currently measured anywhere in the chain. Would be net-new logic.

---

## 4. Recommended path

I'd recommend option **A or B from §3** rather than building net-new logic, for three reasons:

1. **Both are already implemented as confidence modifiers.** Promoting one to also serve as a binary gate is much smaller work than building a new measurement from scratch. We can re-use the regime-age or volume-regime computation directly.

2. **Both ARE orthogonal to direction.** Unlike slope and momentum, neither one says "is direction firm right now." Age says "how long has direction been firm." Volume says "is participation backing the directional move."

3. **They give us a clean A/B test.** If we promote regime-age to also gate-duty AND keep the volume modifier on continuous, we can compare two real sustainability dimensions side by side and pick the better one once calibration data accumulates.

Of the two, my lean is toward **B (volume confirmation as gate)** for two reasons:

- Volume is the classical human-trader sustainability signal. Trader intuition says "trend without volume = false breakout, trend with volume = real move." That intuition exists because it's empirically true at scale.
- Regime age has a chicken-and-egg risk: if we say "downgrade pairs that have been in TFS too long," we may inadvertently downgrade the strongest, most-persistent winners (the pairs that stay in TFS for days because they're actually trending hard).

A reasonable design:
- Replace the current momentum-based binary gate with a volume-confirmation binary gate.
- Threshold: pair's current volume vs its rolling N-bar average. If current < 0.8 × average, fail the gate (mark trend as unsustainable, downgrade).
- Keep B68.2 (volume regime) as the continuous confidence modifier in parallel — they measure related but different aspects of volume.
- Wait for calibration data to validate.

### Counter-option: drop the second gate entirely

This is also a defensible answer. If after two attempts we still don't have a measurement that genuinely separates winners from losers as a binary gate, then we're best served by NOT having a second gate at all — let the regime classifier's DBS ≥ 0.30 do all the work, and let downstream filters (SQE, net-EV, etc.) handle quality control once they're live in Phase 19.

The argument for keeping a second gate is "TFS is too dominant and we need to thin it out." But that argument has been weakening as the regime classifier itself has gotten better. It may not be true anymore.

If you'd prefer to drop the second gate as a cleaner solution while we focus on more-impactful work, I support that.

---

## 5. What I need from you to move forward

Three decisions, in priority order:

1. **Drop the second gate entirely, OR replace it with a new measurement?**
2. **If replace: regime-age, volume-confirmation, multi-TF, or ATR-extension?** (My lean: volume-confirmation.)
3. **If replace: keep the existing measurement as a confidence modifier in parallel, or fold the new measurement INTO the existing modifier?** (My lean: keep parallel, so we have an A/B between the binary gate version and the continuous modifier version.)

Once I have those three answers, I can scope the change, get Langston's review, and ship it as a standalone batch. No new code touches confidence calibration — this is purely a regime-gate change.

---

## 6. What this is NOT

Per the strategic reset 2026-05-16 17:30 UTC:
- This is **not** confidence calibration. The forensic-based recalibration of factor weights is shelved until Phase 19.
- This is **not** dependent on VTS win/loss data. The decision is structural (what should the second gate measure), not empirical.
- We are not running an experiment on the existing VTS cohort to validate the new gate. We're picking the cleanest structural answer and shipping it. Validation comes from production live trading once Phase 19 is up.

The Phase 1 floor revert (B-NEW-39) stays in production as a structural correction — same category as this work. We're cleaning up structural issues now; empirical fine-tuning of confidence values is Phase 19 work.
