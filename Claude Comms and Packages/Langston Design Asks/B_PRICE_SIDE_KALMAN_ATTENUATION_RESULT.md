# CC-C — MY CLAIM (i) IS REFUTED BY MY OWN EXPERIMENT. Langston was right.

**Ref `a5f7daa55`. Instrument: `scripts/analysis/kalman-attenuation-experiment.ts` (committed), run against a real captured series from `scripts/analysis/capture-tick-series.mjs` — 6 symbols, 10 min, 67,038 book-update rows, out-of-band.**

## WHAT I PUT INTO THE DEBATE, AND WHICH HALF IS NOW DEAD

> **(i)** high-frequency precision is DISCARDED BY DESIGN, so feeding the filter a fresher input buys little.
> **(ii)** a systematic side offset PASSES THROUGH undiminished.

**(i) IS REFUTED. (ii) IS CONFIRMED.**

| arm | input p50 | output p50 | **survives** |
|---|---|---|---|
| **(i) fresh vs 37.5 s stale**, same quantity | 1.48 bps | 1.30 bps | **87.3%** |
| (ii) mid vs the transactable ask | 1.28 bps | 0.87 bps | 68.5% |
| **(ii-control) CONSTANT half-spread bias** | — | — | **p50 = 1.000** (n=522) |

**n = 676 evaluation instants**, 12 phase-offset replicates × 6 symbols, each replicate on fresh filter instances, cadence 60 s (the measured median observation spacing, `adaptive-kalman.ts:60`).

## ⛔ AND THE PART I MUST OWN: MY FIRST RUN SAID 34.8% AND IT WAS UNDERPOWERED

One grid per symbol, **n = 60**, gave *"SURVIVES p50 34.8%"* — which would have CONFIRMED my claim. Adding phase replicates to n = 676 moved it to **87.3%**. The INPUT median barely moved (1.38 → 1.48 bps); the OUTPUT median went 0.48 → 1.30.

⇒ **the first grid happened to start where the two filters tracked closely, and it was not typical.** ⛔ **A 2.5× error, in the direction that flattered my own argument, from a sample I chose.** The replicates were not a refinement — they were the difference between a wrong answer and a right one.

## WHAT SURVIVES AND WHAT DOES NOT

- ⛔ **DEAD: "the smoother throws the freshness advantage away."** It does not. **87% of it reaches the levels.** Anyone who heard me say the filter makes fresher data pointless should discard that.
- ✅ **STANDS: bias pass-through.** `p50 = 1.000` is the measured form of Langston's analytic point — `x ← x + K(z−x)` has a fixed point at `x = z`, unity DC gain. A constant offset is tracked, not removed.
- ⚠️ **THE RECOMMENDATION SURVIVES ON MAGNITUDE ONLY, AND IT IS NOW MUCH NARROWER.** Side error ≈10 bps × 0.69-1.00 ≈ **7-10 bps**; freshness ≈4 bps × 0.87 ≈ **3.5 bps**. **That is 2-3×, not the 7× my dead mechanism implied.** "Fix the side first" still ranks first — but "the feed does not matter" was wrong, and freshness is now a live candidate rather than a dismissed one.

## STATED LIMITS
- **Ratio of medians, not median of per-instant ratios** — they are not the same statistic and I am reporting the first.
- **6 symbols, one 10-minute window, one time of day.** The `EUR/USD` member is a fiat pair and atypical of the crypto population.
- Each replicate runs a COLD filter, so warm-up instants are included at the same rate in every arm — comparable across arms, but not the steady state alone.
- The `mid vs ask` arm is not a constant bias (the spread varies), which is why it reads 68.5% rather than 100%. **The 1.000 control is the clean measurement of pass-through; the 68.5% is the real-world mixture.**
