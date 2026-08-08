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

**★★ OBJECTIVE 1b — SEPARATE DATABASE LANES FOR CRYPTO vs xSTOCK (Kyle-raised 2026-08-08; MEASURED, and it changes obj-1's "leave wildcard" posture).**
**MEASURED — object `module_constants`, population ALL 999 rows:** **475 wildcard (47.5%) · 186 `crypto_spot` · 306 `xstock_spot`.** ⇒ **the asset-class separation Kyle drove across several batches is roughly HALF DONE.**
**★ AND IT STOPPED EXACTLY WHERE IT MATTERS MOST: EVERY strategy module is 100% wildcard — ZERO class-scoped rows.** `strategy.dhma` (25) · `strategy.range_trade` (15) · `strategy.abcd_long` (13) · `strategy.adaptive_flow` (13) · `strategy.mean_reversion` (13) · `strategy.liquidity_trap` (13) · `strategy.sma_trend_ride` (12) · `strategy.reverse_impulse` (11) · `strategy.defensive_hedge` (11) — **plus `position_sizing` (11) and `data_lifecycle` (32).**
⇒ **the infrastructure got its lanes; the strategies never did.** The signal-generating levers — the ones that decide target, stop and confidence — are shared between an asset trading **hourly bars at ~1.19% per-bar volatility** and one trading **15-minute bars at ~0.17%**, against the **same flat fee**. **That is the widest remaining instance of the problem this batch exists to fix.**
**KYLE'S CHALLENGE, ACCEPTED: my original obj-1 said "per-class dimension available but LEFT WILDCARD."** That perpetuates the exact gap. **REVISED POSTURE — two provably-separable steps, BOTH in this batch:**
- **1b-i MIGRATE (provably neutral):** the nine buffers land wildcard at today's values; a before/after read proves zero behaviour change.
- **1b-ii SEED PER-CLASS — ONLY WHERE THE CLASS DIFFERENCE IS MEASURED, never by assumption.** Demonstrated so far: **bar horizon (60m vs 15m), per-bar volatility (1.194% vs 0.170%), and the fee-to-target ratio.** Those justify per-class **geometry** levers. **They do NOT justify seeding every strategy lever, and this scope does not propose that.** Each seeded lever names its measurement; every lever left wildcard is **listed with the reason**, so the next reader sees a decision rather than an omission.
⚠️ **Step ordering is structural: 1b-i must be verified neutral BEFORE 1b-ii moves any value, or a behaviour change cannot be attributed to either.** *(This is the B79.0n.STRATEGY discipline applied correctly — that batch shipped the mechanism and deferred the values; the defect is that the deferral was never scheduled, not that it was wrong.)*

1. **NINE HARDCODED STRATEGY BUFFERS → `module_constants`, values UNCHANGED.** `adaptive-flow.ts:44` · `defensive-hedge.ts:46` · `inside-bar-reversal.ts:47,48` · `morning-star.ts:51` · `reverse-impulse.ts:45` · `support-bounce.ts:55` · `volatility-edge.ts:45,46` (0.002–0.005). **Migration only at THIS step; no value moves in 1b-i.** ⚠️ **SUPERSEDED IN PART BY obj-1b above:** the earlier "left wildcard, full stop" posture is withdrawn — wildcard is now the state at the END OF 1b-i, not the end of the batch. 1b-ii then seeds per-class rows where the class difference is measured.
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

---

# STEP-1 REVISION r2 — Langston CHANGES-NEEDED, 2026-08-08 (verdict at `1b065a0f2`)

**Obj 1 approved as written · obj 2 approved with two additions · obj 4 clear · obj 3 and obj 5 BOUNCED · §2.5 ruled. Every change below is his, not a re-argument.**

## r2.1 — §2.5 RE-FRAMED. My attribution was wrong, and the honest framing is much bigger than what I asked.

**CORRECTION:** the fence *"model-vs-model and data-fenced; real pFill = Phase-21"* is **NOT in `exploration-lane.ts`** — it is **`server/core/math/maker-taker-decision.ts:75`**. A different object: the decision kernel's static `maker_taker.maker_fill_probability`, **homed at #410** and restated in **`ADJUSTMENT_FRAMEWORK.md:52`** and **`SYSTEM_MANUAL.md:521`**. ⇒ **the lane's header does not contradict itself; I merged two files.**

⇒ **RESTATED: option (a) is NOT "one measurement." It is a PROPOSAL TO REOPEN A HOMED PHASE-21 GATE carrying three governance surfaces.** That is a Kyle-level scope call, not a CC-C measurement.

**★ THE TWO NUMBERS ARE DIFFERENT OBJECTS (his catch, and it dissolves my ~1.5× claim):** **0.50 is an EX-ANTE DECISION PARAMETER; 75.4% is an EX-POST SIMULATOR OUTPUT.** Their disagreement measures **our config against our own simulator** — not against the venue. **The "maker EV is discounted ~1.5× more than reality" line is WITHDRAWN: it compared a knob to its own downstream model.**

**RULING ADOPTED — depth RIDES BESIDE obj-3 as a ONE-SHOT FALSIFICATION TEST:**
- **Depth can only REFUTE, never certify** — queue position and adverse selection are exactly what an unplaced order never reveals. If price never traded through the limit, a fill was impossible; that is the only inference available.
- **The falsifier is declared BEFORE the test runs. It moves no knob.**
- ⚠️ **CIRCULARITY CHECK, mandatory and prior: confirm the fill simulator does not itself consume depth.** If it does, the test is circular and does not run.
- **🔒 FENCE: NO `pFill` CHANGE LANDS INSIDE OBJ-3's PRE-REGISTERED WINDOW, whatever the depth study says.** A measurement must not confound an experiment; a mid-window parameter change would.

## r2.2 — OBJ 3 BOUNCED: my headline was POOLED, which this scope forbids elsewhere.

**His arithmetic:** (12 × 83.3% + 229 × 45.0%) ÷ 241 = **46.9%**. ⇒ **"crypto sits AT 46.9% vs a 46.2% break-even, on the line" is the mean of a lane that WORKS (83.3%) and a lane ADMITTED ON KNOWN-NEGATIVE netEV AND DESIGNED TO LOSE (45.0%, n=229 = 95% of the pool).** **"On the line" is an artifact of averaging the learning subsidy into the organic lane.** ⇒ **the pre-registration was registered against the wrong number.**

**REQUIRED BEFORE OBJ-3 RETURNS:**
- (a) **re-derive break-even and win rate PER COHORT** — organic and exploration separately — and pre-register against the **ORGANIC** cohort, the only one the experiment is about;
- (b) **NAME THE KNOB** — table, key and `file:line` for what actually moves (`strategy_geometry` / `TARGET_ATR_MULT`?). The scope omitted it entirely, so there is **no history, no intent and no disposition** on the thing being changed.

## r2.3 — OBJ 5 BOUNCED: it is the declared prerequisite and was the thinnest objective.

**His standing ruling: a retention key alone does not tier a table — it must ALSO be in the sweep's hardcoded list.** Name the tables against the sweep + census at **`SIM:3242`**, with code site and disposition per table.

**★ AND THE HEADROOM ARGUMENT FAILS 29(b):** *"~44 GB/week as tiering releases"* carries **no object, no population, no positive control** — and it is the ENTIRE basis for obj-4's storage headroom. **Re-measure it properly or obj-4 has no foundation.**

## r2.4 — OBJ 2 approved, TWO ADDITIONS (both real defects the carry-through alone does not fix)

- (a) **Provenance is thinner than the code:** `active-execution-engine.ts:3492-3494` names **reorg-B3** and the reason verbatim — **quote it, and delete that comment in the same diff.**
- (b) **THREE DISTINGUISHABLE STATES REQUIRED, per #546 — not one number wearing a real value's clothes:** `:1507` guards on **TRUTHINESS**, so a genuine VolNoise of **0** still falls through to 0.3; and `fx5-scanner.ts:1074` substitutes **0.6** on out-of-range/non-finite. ⇒ the record must distinguish **computed / clamped / absent**.

## r2.5 — OBJ 1 approved, with one addition

Five of the nine sites carry an explicit *"remains hardcoded — KEEP per LEVER_INVENTORY"* comment. **Those comments die with the change (§15)** — a surviving KEEP comment beside a migrated lever is a false instruction to the next reader.

## r2.6 — §13 HOMES (his: owner + due at the moment of agreement, not later)

| item | owner | home |
|---|---|---|
| The crypto-perp COLLECTION proposal (obj-4's output) | CC-C | its own scope, opened only if obj-4's arithmetic justifies it |
| §2.5 option-(b) branch — if depth cannot refute and the gate stays closed, **the lane's −$144.52 needs a new justification** | CC-C | raised to Kyle as a scope call; NOT resolved by us |
| Board card for THIS batch | CC-C | **filed with this revision** — the existing "Recalibrate crypto target sizes" card is objective 3 ALONE, not the batch |

**Langston sets `Review` when the two bounced objectives return.**


---

# r3 — OBJ-3 RE-DERIVED PER COHORT (Langston's requirement). **THE RESULT INVALIDATES THE EXPERIMENT'S PREMISE.**

**MEASURED** — `closed_trades`, canonical predicate, split by `admissionBasis`:

| cohort | n | win% | target% | stop% | break-even needs | EV | margin |
|---|---|---|---|---|---|---|---|
| **organic** | 12 | **83.3** | **7.85** | 7.96 | 55.4% | **+4.41%** | **+27.9 pts** |
| exploration | 230 | 45.2 | 2.38 | 2.00 | 63.9% | −0.82% | −18.7 pts |
| *(pooled — what I wrongly pre-registered against)* | 241 | *46.9* | — | — | — | — | *artifact* |

**★★ THE ORGANIC LANE'S TARGETS ARE 7.85% — MORE THAN THREE TIMES THE EXPLORATION LANE'S 2.38%.**

⇒ **OBJ-3 AS WRITTEN IS BACKWARDS. Kyle's 2.5–4% band sits BELOW the geometry of the lane that already works, and ABOVE the lane that fails. Running it would move the successful cohort's target DOWN toward the failing one.**

**★ AND IT REFRAMES THE WHOLE BATCH: THE TARGET IS NOT A KNOB, IT IS A SELECTOR.** The organic lane does not succeed because someone set a good target — it succeeds because **only signals whose NATIVE target is already large enough to clear the fee wall get through the gate.** A 7.85% target clears the ~1.6% maker rawEV bar easily; a 2.38% one cannot. **Raising a multiplier would not manufacture more organic-quality signals — it would re-label the same distribution and move the same signals across the same bar.** The live question is whether **more signals with naturally large targets exist**, which is a supply question, not a threshold question.

**⚠️ THE CAVEAT THAT BOUNDS ALL OF IT, STATED BEFORE LANGSTON HAS TO: ORGANIC STOP COVERAGE IS n=1.** The 7.96% stop — and therefore the 55.4% break-even and the +27.9-point margin — rests on **a single trade**. The 7.85% target is n=12. **Neither is decision-grade.** The direction is stark enough to act on as a HYPOTHESIS; the magnitudes are not quotable.

**⇒ PROPOSED REPLACEMENT FOR OBJ-3, for Langston's ruling:** drop the 2.5–4% arm and instead **measure the TARGET DISTRIBUTION of organically-admitted vs rejected crypto signals.** If organic admission is simply "native target ≥ the fee wall," then the batch's real question becomes **why so few signals carry large native targets** — which points back at the ATR × multiplier derivation and the 60m horizon, and is answerable from data we hold.

**THE KNOB, NAMED (his second requirement):** `module_constants` · module `strategy.<name>` · key **`target_exit_atr_multiplier`** · read at `getCachedNumbersForModule` in each strategy file (e.g. `strong-bull-trend.ts:90`, `adaptive-flow.ts:84`) · **all rows currently `asset_class='*'`** (values: 6.0 SBT · 3.0 adaptive_flow/pivot_shift · 2.5 morning_star/volatility_edge · 2.0 inside_bar/reverse_impulse/support_bounce · 1.8 defensive_hedge). **Provenance: B72 migrated these from hardcode; B79.0n.STRATEGY wired the per-class scope and deliberately did not seed values.**
