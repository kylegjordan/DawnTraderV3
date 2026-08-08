# B-CRYPTO-UNBLOCK — Scope (Step 1)

change-class: architecture

**Batch:** B-CRYPTO-UNBLOCK — remove the hardcoded strategy levers, restore the volatility value the filter already computes, run a live target experiment, and open a crypto-perpetuals feed behind a storage gate. **Owner CC-C. Langston pairwise per §27.** Deploys via `dt-deploy`.

## 0. Kyle's directives (verbatim; this scope implements, it does not re-litigate)

1. *"I'm good with moving the strategy hardcodes to the database."*
2. *"carry the filter's real value through to the record"* — his ruling, superseding my delete proposal.
3. *"raise the target to somewhere between 2.5 and 4 to see if it opens up more trades and how those trades close… We're in testing and learning mode."*
4. *"adding in opening up a feed for crypto perpetuals if that is possible. You'll have to consider API rate limits and our storage. We will likely need to change the hot to warm migration so that it happens faster."*
5. *"we are not supposed to hardcode anything in the system."*

## 1. WHY NOW — the investigation's finding, in one paragraph

Paper crypto is **two populations averaged into one flat number**: `organic` 12 trades / 83.3% wins / **+$133.52**, and `exploration` 229 trades / 45.0% wins / **−$144.52** (canonical predicate, n=241). They near-cancel to −$11, which is why it read as "nothing happening." **The organic lane works.** The blocker is that almost nothing reaches it: the fee wall sets a ~1.6% maker / ~1.95% taker rawEV bar (`exploration-lane.ts:9`), and crypto's ATR-derived targets sit below it.

**★ AND THE EXPLORATION LANE'S OWN PURPOSE NAMES THE UNBLOCK.** `exploration-lane.ts:1-12`, verbatim: the lane exists for *"the maker FILL-RATE measurement that **replaces the pFill=0.50 pessimism and reopens the organic gate**."* **Measured: the real fill rate is 75.4%** (242 filled / 79 never-filled) against a modelled **0.50** ⇒ **maker EV is discounted ~1.5× more than observed reality.** ⚠️ **But the same file fences it:** *"the paper maker-fill data is model-vs-model… real pFill = Phase-21."* **That fence is the central question of this batch (§2.5), not a footnote.**

## 2. Numbered objectives

1. **NINE HARDCODED STRATEGY BUFFERS → `module_constants`, values UNCHANGED.** `adaptive-flow.ts:44` · `defensive-hedge.ts:46` · `inside-bar-reversal.ts:47,48` · `morning-star.ts:51` · `reverse-impulse.ts:45` · `support-bounce.ts:55` · `volatility-edge.ts:45,46` (0.002–0.005). **Migration only; no value moves in this batch.** Per-class dimension available but **left wildcard** (same discipline as B79.0n.STRATEGY: ship the mechanism, don't move values).
   **PROVENANCE (§2 1.b):** B72 deliberately KEPT these — `LEVER_INVENTORY.md:224`: *"structural geometric buffers… geometric definitions, not tunable risk levers."* **That intent no longer holds:** a flat 0.3% is **~24% of crypto's measured 1.248% risk leg**, the risk leg is a direct EV input, and the same flat constant is **a fifth of a crypto bar but nearly two whole xStock bars** — it means different things per class. Disposition **(2) relevant-but-needs-updating**.
2. **VOLNOISE CARRY-THROUGH.** The LIVE filter is healthy — `fx5-scanner.ts:1065` `calculateVolNoise(ohlcPrices)`, gated `:1070`, sanity-bounded `:1074`, and it demonstrably rejects pairs. Only the DOWNSTREAM STAMP is constant: writer `active-execution-engine.ts:3496` `?? 0.3`, reader `:1507` `: 0.3`. **Carry the scanner's real value through to the trade record** (Kyle's ruling). **Correction on the record: this is NOT `DEFAULT_VOLATILITY` (Langston — that const is `quality_index.ts:16`, unexported), and it was DESCOPED deliberately (`P19_B7_2c_SCOPE.md:11`), so it is a vestige, not a silent data-loss bug.**
3. **★ LIVE TARGET EXPERIMENT, 2.5–4%, PRE-REGISTERED.** Crypto currently sits at **46.9% wins against a 46.2% break-even** — *on* the line, so a target change moves win rate and payoff simultaneously. **Therefore, written BEFORE the arm starts:** the target value(s), the minimum sample, the stopping rule, and the decision criterion. **B63 measured outcomes as heavily clustered (`B63_STREAKINESS_ANALYSIS.md:53`, ~10²⁵× more extreme than independence), so effective-n ≪ row count — the minimum sample must be argued, not assumed.**
4. **CRYPTO PERPETUALS FEED — GATED, NOT ASSUMED.** Kraken lists **284 tradeable perpetuals; we collect 10** (all equity-underlying; ~274 crypto, none). A `crypto_perp` code directory exists with **no tables**. **⛔ NO COLLECTION IS PROPOSED IN THIS SCOPE.** Objective 4 is the ARITHMETIC: request budget vs Kraken's documented rate limits, rows/day and bytes/day at candidate symbol counts, and the headroom against the **200 GB cap (currently 133.4 GB / 66.7%, falling ~44 GB/week as tiering releases)**. **A collection proposal is a SEPARATE scope that this arithmetic either justifies or kills.**
   **★ WHY IT MATTERS BEYOND COVERAGE: perpetual fee schedules differ from spot, and the fee is the binding constraint on crypto EV.** Whether perps are materially cheaper is **unmeasured and is part of this objective**.
5. **HOT→WARM ACCELERATION — PREREQUISITE, ordered FIRST.** Kyle: *"so that it happens faster and we're not killing our hot storage limits."* Per `STORAGE_POLICY.md`. **Sequencing is structural: the retention change lands and is verified releasing space BEFORE any new stream is even proposed.**

## 2.5 ★ THE QUESTION THIS BATCH MUST ANSWER, AND IT IS LANGSTON'S TO RULE

**The lane was built to produce a fill-rate measurement that its own header says cannot yet be trusted** (*"model-vs-model and data-fenced; real pFill = Phase-21"*). **75.4% is our simulation marking its own homework.** Either:
- **(a) the fill model can be validated against something external** — **order-book depth at the resting price is the obvious candidate and we already collect it** (it already feeds the slippage model); or
- **(b) it cannot, and the lane is buying a number that stays fenced until live** — in which case the lane's **stated justification does not hold today** and its **−$144.52 / 3 weeks** needs a different one.
**CC-C's position: (a) is worth one measurement before conceding (b).** If depth-at-price predicts our simulated fills, the fence weakens on evidence rather than on assertion. **Langston rules whether that measurement gates objective 3 or rides beside it.**

## 3. OUT

Changing any buffer VALUE (migration only) · raising the pWin ceiling (**refused** — measured 35.1% on the unbiased population, below even the 0.40 floor; it fabricates edge) · a negative-EV floor (**withdrawn** — exploration WINNERS were admitted at a WORSE median netEV (−0.047) than LOSERS (−0.011), so the score has **no ordering power below zero**) · crypto bar-frequency change (2026-06-03 study prices it as a foundation batch: regime recalibration + time-anchored lookbacks + DBS backfill) · the actual perp collection (§2 obj-4) · `B-SIZING-DEC-RESTORE` and `B-READER-TRUTH` (separate, already gated).

## 4. Known limitations, stated up front

- **Stop price is recorded on only 49/241 (20%) of crypto closes** — caps any replay at n=25; same gap as #677.
- **n=12 organic is very small**; one outsized winner may carry the +6.87% average. **Not yet decomposed.**
- **The anneal floor tightened across the measurement window**, so the two cohorts are not drawn from identical conditions.
- **Four self-corrections in the investigation behind this scope** (fee-not-binding, bigger-targets-refuted, pWin-retraction-restored, and Langston's population bounce). **Every figure above is post-correction.**
