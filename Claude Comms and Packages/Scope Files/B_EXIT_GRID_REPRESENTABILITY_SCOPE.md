# F-G-1 — B-GRID-REPRESENTABILITY — SCOPE (Step 1, r4)

change-class: architecture

> **STATUS: Step 1 r4. This file is HALF of the former F-G. Langston ruled the SPLIT at `cdb783a8d` and the reason is a MEASUREMENT DEFECT, not size — see §1.**
>
> ⛔ **OBJECTIVE NUMBERS ARE DELIBERATELY NOT RESEQUENCED.** They stay `OBJ-7` / `OBJ-7b` / `OBJ-9` because Langston's r3 verdict, `#916`, `#917` and `PHASE_19_PLAN` all cite them by those names. **Renumbering would break every inbound citation to buy tidiness** — the same trade `CLAUDE.md` §9 refuses. F-G-2 keeps `OBJ-0`–`OBJ-6` and `OBJ-8` for the same reason.

---

## 1. WHY THIS IS A SEPARATE BATCH — AND IT IS NOT ABOUT SIZE

**Langston's ruling, and it is sharper than the size argument I offered: `OBJ-7` CONFOUNDS `OBJ-0`.**

F-G-2's `OBJ-0` is a pre-registered before/after on exit behaviour — a 2×2 of old-rule × new-rule outcomes whose discordant cell is the kill criterion. **Grid rounding MOVES THE STOPS THEMSELVES** (p95 2.343%, worst 12.96% of stop distance). **Ship both in one deploy and the "old rule" arm no longer exists in comparable form** — the ruler and the thing being measured both changed in the same step.

⇒ **This batch ships FIRST and ALONE, so F-G-2's shadow run happens entirely inside the post-gridding era and both arms see gridded prices.** Kyle's *"OBJ-7 ships first"* directive is **preserved and strengthened**, not overridden. **Stated cost: two review cycles, and a longer road to the exit fix.**

---

## 2. ⛔ WHAT THIS BATCH IS *NOT* — CORRECTING MY OWN HEADLINE

⛔⛔ **I TOLD KYLE OUR STOP AND TARGET PRICES "ARE NOT PRICES THE VENUE ACCEPTS." THAT IMPLIES AN ORDER-VALIDITY DEFECT AND IT IS FALSE IN THE PRESENT TENSE (Langston finding B).**

`venue-validate.ts:78`/`:98` validate **`type: 'buy'` only.** In paper mode **stops and targets never become resting venue orders at all** — they are internal trigger levels. **Exits have ZERO venue contact.**

⇒ **WE ARE NOT EMITTING INVALID ORDERS. WE ARE EMITTING INVALID THRESHOLDS.** The 2.7% / 9.9% measurement is:

- **(i) an `OBJ-8` DISCRIMINATION problem** — off-grid limits make through-vs-touch undecidable (§3), and
- **(ii) LIVE-PARITY DEBT** — in live mode these same numbers become real order prices.

**Both are real. Neither is "the venue is rejecting us today."** ★ **Recorded here because as originally written this batch would have been graded at Step 4 against a claim that is false.**

---

## 3. THE MEASUREMENT

**406 closed crypto trades, each matched to its OWN published Kraken `tick_size`:**

| price | representable |
|---|---|
| entry | **80.8%** |
| stop | **2.7%** |
| target | **9.9%** |

**Kraken publishes `tick_size` per pair: 1,437 pairs, 11 distinct values.** Entries inherit validity from an observed print; stops and targets are ATR-derived floats.

⛔ **THE PLACEBO MECHANISM, STATED CORRECTLY (Langston Q1 — my r3 reason was wrong, and the wrong reason would have been graded).** It is **not** "2.7% is a small number." It is that **for an off-grid limit, `>` and `>=` ARE THE SAME PREDICATE** — `high` can never equal a price the venue cannot express — so through-vs-touch has an **empty discriminating cell by construction.**

✅ **FALSIFIABLE AND CHEAP, and it is the fence:** count exact `high == limit` across the 406. **~0 now; non-zero after.**

⛔ **AND THE DEPENDENCY GRAPH WAS WRONG IN r3: `OBJ-7` GATES `OBJ-8`, NOT `OBJ-1`.** Bid-vs-mid is unaffected by gridding.

---

## 4. ⛔ THE ROUNDING ALREADY EXISTS — AT THE WRONG SEAM (Langston finding A)

`execution/venue-validate.ts:94` — `formatToDecimals(req.limitPrice, entry.pairDecimals, 5)`. **We round to the venue's precision FOR THE VALIDATE PROBE ONLY, then fill at the UNROUNDED price.**

⇒ **The venue oracle is being asked about a price we do not use.** ★ **And it explains an absence I never chased: 19% off-grid entries have produced no `VALIDATE_REJECTED` flood (`active-execution-engine.ts:3366`) because the probe was PRE-CORRECTED.**

⇒ **`OBJ-7`'s crypto leg is largely MOVING this rounding upstream, not building it.** A nearest-rounding reference implementation already exists at `venue-validate.ts:68`.

**✅ RECONCILIATION RUN (Langston's required check, all 1,437 pairs): `10^-pair_decimals == tick_size` for 1,433. FOUR DISAGREE — `CELRUSD` (tick 0.000001, decimals 7) · `REQUSD` (0.0001, 5) · `VTHOUSD` (0.000001, 7) · `WINUSD` (0.00000001, 9).** In each, the decimals permit one digit finer than the tick allows.

⇒ **`pairDecimals` IS INSUFFICIENT. `OBJ-7` KEYS ON `tick_size`.** ⚠️ **None of the four has ever been traded (0 rows in `closed_trades`) ⇒ LATENT, not live-impacting — but the existing `:94` formatting is wrong for them, so moving it upstream must not carry the decimals basis with it.**

---

## 5. ⛔⛔ KYLE'S RE-CHECK — HE WAS RIGHT, AND THE ANSWER IS BETTER THAN A RE-CHECK

**Kyle's clarified point (2026-08-27) is NOT the one Langston answered.** Langston answered gate-ordering. **Kyle's concern is GEOMETRY INTEGRITY:** *"as soon as it gets out of the signal orchestrator, if we round it, that whole signal may not look like the signal that was created… therefore that stop and that target and entry combination may not work the way that the signal was designed to work."*

**✅ CONFIRMED AT THE CODE — the signal is NOT three independent prices. It is an ANCHOR PLUS A TWO-LINK CHAIN** (`strategy-engine.ts:248-250`):

```
stopPrice    = entryPrice - atr * stopAtrMultiplier
riskDistance = entryPrice - stopPrice
finalTarget  = entryPrice + riskDistance * targetAsRMultiple
```

⇒ **the target is derived from the STOP DISTANCE, not from entry independently.** **Round the three endpoints independently and the risk distance changes underneath a target that was computed from the OLD one — so the R multiple, which is the strategy's core design parameter, silently becomes something else.**

**✅ MEASURED — R-multiple drift, 398 long crypto trades, both schemes:**

| scheme | median | p95 | p99 | worst | >1% | >5% |
|---|---|---|---|---|---|---|
| **independent** nearest-rounding | 0.137% | 1.771% | 3.647% | **7.14%** | **43/398** | **2** |
| **chain-preserving** | 0.086% | 0.800% | 1.819% | **3.57%** | **15/398** | **0** |

⛔⛔ **CHAIN-PRESERVING ROUNDING IS WITHDRAWN. LANGSTON REFUTED THE PREMISE AT `ee1aceddc` AND I VERIFIED THE REFUTATION MYSELF RATHER THAN TAKING IT.**

**MY ERROR, NAMED: I READ ONE SITE AND GENERALISED IT TO THE SYSTEM.** `strategy-engine.ts:248-250` — the lines quoted above — are the **B63 Item-12 strong-trend OVERRIDE branch**, not the common path. **The two-link chain is a MINORITY form.**

**✅ VERIFIED AT THE CODE: in the ten file-based strategies — where most live signal volume originates — the chain appears ZERO times. Every target is an ATR DISTANCE FROM ENTRY:**

| strategy | target form |
|---|---|
| `support-bounce:264` · `morning-star:175` · `pivot-shift:182` · `reverse-impulse:176` · `inside-bar-reversal:190` · `adaptive-flow:177` · `defensive-hedge:238` · `strong-bull-trend:153` | `entryPrice + K × ATR` |
| `volatility-edge:189` | `Math.min(measuredMoveTarget, atrTarget)` — neither leg R-based |

**And their STOPS are STRUCTURAL LEVELS, not distances:** `support-bounce:263` `supportLevel × (1 − buffer)` · `morning-star:173` `min(c2Low,c1Low) × (1 − buffer)` · `pivot-shift:180` `max(morningStarLow, atrBasedStop)`.

⇒ **FOR THAT POPULATION `R` IS NOT A DESIGNED PARAMETER — it is an EMERGENT RATIO of two independently-designed quantities** (a stop pinned behind a structure; a target set at an ATR distance from entry). ⛔ **Chain-preserving rounding would PRESERVE THE ONE NUMBER NOBODY DESIGNED BY MOVING THE TWO THAT WERE.** ★ **And Langston's sharpest point: the inferred R is largest exactly where the stop is tightest, so the 15/398 residual I reported was PARTLY MANUFACTURED BY THE SCHEME, not purely a property of tight stops.**

### ✅ THE SCHEME ADOPTED INSTEAD — DIRECTION BY PRICE ROLE

⛔ **Langston: the tie rule (half-up vs half-even) is NOT the decision that matters. The decision is DIRECTION, and it follows from what KIND of quantity each price is.**

| price | rounding | why |
|---|---|---|
| **entry** | **NEAREST** | an observed print, already representable 80.8% of the time; it is a point estimate, not a boundary |
| **stop** | ⛔ **AWAY from entry** (down for a long) | **a stop is a BOUNDARY, not a point estimate.** Rounded the wrong way it stops being one — a `supportLevel`/`parentLow` stop nudged UP lands **inside the structure it was deliberately placed behind.** That is a design violation, not noise |
| **target** | **AWAY from entry** (up for a long) | preserves *"at least K × ATR"*; can never manufacture a win by moving the target closer |

**✅ MEASURED — WHY NEAREST IS WRONG FOR THE STOP: on 398 long crypto trades, nearest rounding moves the stop TOWARD entry on 197 (49.5%), away on 191 (48.0%), exact on 10 (2.5%).** ⇒ **HALF OF ALL OUR STOPS WOULD BE NUDGED INSIDE THEIR OWN STRUCTURE.** ⚠️ **And the population is dominated by exactly the structural-stop strategies:** `morning_star` 104 · `inside_bar_reversal` 65 · `reverse_impulse` 64 · `pivot_shift` 63 · `support_bounce` 45.

**✅ MEASURED — WHAT THE SAFE DIRECTION COSTS:** extra risk on the stop **median +0.241%, p95 +2.941%, worst +11.11%**; extra reach on the target **median +0.167%, p95 +1.807%, worst +10.83%**. **70 of 398 need >1% extra risk; 7 need >5%.** ⇒ **the trade is a quarter of a percent of extra risk in the median, against violating design intent on half of all stops. Away-rounding wins clearly, and the tail is the SAME tight-stop population already isolated in §8 — not a new exposure.**

⚠️ **THIS DOES NOT REOPEN THE "PESSIMISM IN THE PRICE" QUESTION Langston already settled (Q2: nearest, yes).** That ruling was about **biasing rounding as a MODELLING choice** — using it to inject conservatism. **This is different and narrower: it is about respecting what kind of quantity each price IS.** A boundary rounded into the thing it bounds is not conservative or aggressive — **it is wrong.**

### ✅ THE INTENT QUESTION IS SETTLED — MY COUNTER DID NOT SURVIVE, BUT IT COST ONE SITE, NOT NINETEEN

**Langston found the role where away-rounding is WRONG, and it is my own criterion with the sign reversed.** `volatility-edge.ts:188-189`, verbatim:

```
// Conservative: take the smaller (closer) target
const targetPrice = Math.min(measuredMoveTarget, atrTarget);
```

**That target is a CEILING, not a floor.** My table justified away-rounding the target as *"preserves at least K x ATR"* — **false for this strategy, whose design says AT MOST the measured move.** Rounding it away pushes it **past the bound it was defined by.** ★ **A boundary rounded OUT of the thing it bounds is as wrong as one rounded INTO it.** The mirror case passes: `vwap_pullback`'s `max(...)` is a FLOOR, so away is safe. ⇒ **THE DISCRIMINATOR IS CAP-vs-FLOOR, and there is exactly ONE cap.**

✅ **HE THEREFORE WITHDREW THE 19-SITE BUILD — my evidence carried that part.** `R` is emergent for the ATR-target majority, and away-rounding moves both legs of a genuine chain outward together, so the chain sites need nothing carried. ⚠️ **A SECOND REAL CHAIN I DID NOT NAME: `strategy-engine.ts:532` (`sma_trend_ride`).** ⇒ **ONE BIT AT ONE SITE: carry `targetIsCap`, or round toward entry at `volatility-edge` alone.**

### ⛔⛔ THE DEFECT AWAY-ROUNDING WOULD HAVE SHIPPED — THE INVARIANT IS PAIRWISE, NOT PER-PRICE

**"Safe for every role without knowing which" was per-PRICE safety asserted where the quantity that matters is a RELATION between two prices rounded under two DIFFERENT rules.**

**The counter-example, and it is not exotic:** tick `0.01`, stop `99.99` (already representable, so it does not move), entry `99.9949` → rounds NEAREST to `99.99`. ⛔ **RISK DISTANCE ZERO.**

⛔ **AND MY FENCE ② COULD NOT SEE IT:** *"no stop moved toward entry"* is measured against the **UNROUNDED** entry, and in that example **the stop never moved at all.** ★ **A fence that cannot fire on the defect it was written for — the exact shape this batch keeps catching elsewhere.**

⇒ **TWO REQUIREMENTS, BOTH IN THIS BATCH:** ① **define "away" relative to the ROUNDED entry** — fix the anchor first, then move the boundaries off it; ② **assert on the ROUNDED TRIPLE: strict ordering, ≥1 tick separation, stop distance ≥ floor.**

### ⛔⛔ AND THIS RESURRECTS KYLE'S RE-CHECK. I DROPPED IT ON A FALSE PREMISE.

**§5 above argued the re-check was unnecessary because Langston's round-THEN-gate ordering makes it a single pass. ✅ VERIFIED AT THE CODE, AND ROUND-THEN-GATE IS NOT WHAT HAPPENS: `applyGlobalGuards` fires INSIDE each strategy** — `adaptive-flow:181`, `defensive-hedge:242`, `volatility-edge:193`, and the rest — **UPSTREAM of the orchestrator seam where `OBJ-7` rounds.**

⇒ **THE GEOMETRY THAT WAS GATED IS NOT THE GEOMETRY THAT SHIPS.** ★ **Kyle's original instinct was correct: *"that whole signal may not look like the signal that was created… therefore that stop and that target and entry combination may not work the way that the signal was designed to work."* ⚠️ I dropped his re-check on the argument that gate-ordering made it redundant — the ordering I asserted does not exist on this path.**

⇒ **`validateStopDistance` AND `validateRR` ARE RE-RUN POST-ROUNDING.** That IS Kyle's re-check, restored, and it is now a correctness requirement rather than a precaution.

### ⚠️ SIDE — "AWAY FROM ENTRY" IS UNDEFINED WITHOUT IT

**All 398 measured trades are LONGS. "Away from entry" has no meaning without the trade side, and the taxonomy carries short forms.** ⇒ **either state where side is read at the rounding seam, or SCOPE THE RULE TO LONGS AND REJECT OTHERWISE.** ⚠️ **`crypto_perp` is onboarded and will not stay long-only** — so an unstated assumption here becomes a live defect on the next class activation, not a theoretical one.

---

## 6. OBJECTIVES

| # | objective | verification criterion |
|---|---|---|
| **OBJ-7** | ⛔ **EVERY ENTRY, STOP AND TARGET IS A PRICE THE VENUE CAN EXPRESS — rounded at the SIGNAL ORCHESTRATOR, the one chokepoint every strategy's signal passes through.** ⚠️ **33 sites in `strategy-engine.ts` compute a stop price; rounding at 33 sites guarantees one is missed and a future strategy is born broken.** **Basis = `tick_size`, NOT `pairDecimals` (§4). Scheme = DIRECTION BY PRICE ROLE (§5) - entry NEAREST, stop and target AWAY FROM ENTRY.** ⚠️ **Chain-preserving was adopted at r4 and WITHDRAWN the same day: Langston refuted the premise and I verified the refutation myself.** | ① Every persisted `entry_price`/`stop_loss`/`take_profit` for **crypto_spot** is an exact multiple of that pair's `tick_size` — **asserted on LIVE ROWS, not a helper's unit test.** ② ⛔ **THE DIRECTION RULE IS THE FENCE, NOT THE TIE RULE** (Langston: *"that is not the decision that matters"*). **Assert on LIVE ROWS that no stop and no target was moved TOWARD entry.** The tie rule is still stated but governs only the entry. **MEASURED BASELINE: nearest would tighten 197 of 398 stops (49.5%) - the fence must show ZERO after.** ③ **Round ONCE; persist ONLY the rounded values.** ⛔ **An unrounded shadow field rebuilds `OBJ-2`'s defect — a second number under a name implying it is the one we use.** ④ ⛔ **The rounding function is PURE and takes NO GATE RESULT AS INPUT** — mechanically forbids the re-round `OBJ-7b` rejects. ⑤ ⛔ **R-multiple drift is RECORDED, NOT GATED - and the r4 chain-preserving column is NOT the baseline, because that scheme is withdrawn.** ★ **Langston: for the ATR-target majority `R` is EMERGENT, not designed, so gating on its drift would defend a number nobody chose.** **WHAT IS GATED INSTEAD: extra risk on the stop (measured median +0.241%, p95 +2.941%) and extra reach on the target (+0.167% / +1.807%) must not exceed those figures on live rows.** |
| **OBJ-7b** | ⛔ **WHAT HAPPENS WHEN A ROUNDED SIGNAL NO LONGER CLEARS ITS GATES. TWO KINDS: (i) VENUE-IMPOSSIBLE** — rounded quantity falls below `ordermin`/`costmin`; **(ii) GATE-MARGINAL** — placeable, but the final geometry misses min-RR / net-EV / sizing. **BOTH REJECT. NO RE-ROUND** (nearest is deterministic ⇒ "round again" can only mean the other way, and choosing the direction that lets a trade through is shopping for a pass). ⚠️ **Langston Q2: round-THEN-gate largely dissolves kind (ii) as a class — retained as a REAL BUT SMALL residual, not the main event.** | ① **Its own `reject_stage` in `signal_eval_archive`** — **verified at the LIVE table:** it carries `reject_stage` + `gate_decision`/`features` jsonb, written at volume (~7.0M rows/3d, both classes). ⚠️ **`shared/schema.ts` does NOT declare this table; its `sqeRejectReason:2142` belongs to `rtb_shadow_pairings` — the schema file is the WRONG OBJECT here.** ② **The two kinds recorded SEPARATELY** — many (i) ⇒ our sizing is too small for the venue; many (ii) ⇒ our gates are tuned finer than the market's resolution. ③ Geometry **before and after**, which gate failed, by how much. ④ **A rate against admits** (denominator measured: 2,037/3d — 1,818 crypto / 219 xStock). ⛔ **No threshold pre-committed.** ⑤ ⛔ **Fence: a rounding-rejected signal DOES NOT trade AND IS recorded** — a silent drop and a logged reject are indistinguishable downstream (`#568`). ⛔ **JUSTIFICATION CORRECTED (Langston Q3): NOT "it was inside the rounding noise" — my own tail refutes that (12.96% is not noise; gridding is deterministic and IS the true resolution). The reason is: THE ROUNDED GEOMETRY *IS* THE GEOMETRY. Whether rejecting is costly is an OPEN EMPIRICAL QUESTION that ④ answers.** |
| **OBJ-9** | ⛔ **THE BAR WRITER SILENTLY DROPS BATCHES — Kyle-directed into this batch, all asset classes.** **MEASURED (full retained error logs 08-14→08-27): 5,897 failed flushes, 962,386 rows dropped** — `crypto_perp` 5,889 · `crypto_spot` 6 · `xstock_spot` 2. *"deadlock detected"* ⇒ **a POSTGRES error: OURS.** **MECHANISM CONFIRMED, FULL PATH (Langston finding D — my r3 path was partial and cost him a 404): `server/services/passive-archive/ohlc-batch-writer.ts` — splice `:108`, try `:127`, catch `:184`.** On a throw the rows are already out of memory. | ① **Splice AFTER a successful write.** ② ⛔ **NOT SUFFICIENT ALONE — Langston finding E, a defect in my proposed fix:** the buffer de-dupes by `(symbol, intervalBegin)` at `:118-126` on **Map insertion order = last wins.** A retried batch appended after fresh rows makes the **STALE** row win and overwrite a good bar. ⇒ **the dedupe switches to MAX-BY-ARRIVAL; do not rely on preserving order, which is the fragile half.** ③ Bounded retry + bounded buffer ⇒ persistent failure degrades **loudly**. ④ **All classes in one fix** — the writer is shared. ⑤ ⛔ **STATE WHICH `#705` INSTANCE THIS CLOSES: `#705` was filed against the TICKER writer; this fixes the OHLC writer. Name what happens to the other, or the batch closes reading as though `#705` were discharged.** ⑥ ⚠️ **HONEST, AND COMPLETED IN THE DIRECTION THAT MATTERS (Langston Q7): ~100 bars over 13 days on the traded classes is negligible BY COUNT — but the drops are NOT a uniform sample of minutes. `deadlock` is load-correlated, load correlates with volatility, and volatility is exactly when a stop or target is touched ⇒ the dropped bars are PLAUSIBLY CONCENTRATED in the minutes `OBJ-8` depends on.** |

---

## 7. xSTOCK — THE GRID MUST BE DERIVED, AND MY r3 METHOD WAS WRONG

**Kraken does not index xStocks in `AssetPairs` at all** — documented, not re-opened (`symbol-canonicalizer.ts` `KNOWN_NONEXISTENT_NAMES`, B-NEW-36 sub-batch (c), `#120`). ★ **AND THERE IS NO VENUE ORACLE EITHER (Langston finding C, recorded so nobody offers it later as an untried option — `#453`): `venue-validate.ts:92` returns `skipped` for every xStock, so xStock opens are NEVER venue-validated.**

⛔⛔ **MY r3 METHOD — "round to the coarsest well-observed decimal place" — DOES NOT HOLD, and the hole is not the one I flagged (Langston Q4).** Coarser-is-safe requires the coarse increment to be an **INTEGER MULTIPLE of the true tick.** That holds only if the grid is a power of ten — **which I measured on CRYPTO and asserted onto xSTOCK, the one class with no published tick.** **Counter-example: true tick `0.0025`, "coarser" `0.001` ⇒ every price invalid.** Non-decimal increments are ordinary on equity venues.

✅ **METHOD REPLACED: derive the grid as the GCD OF OBSERVED PRICE INCREMENTS, PER SYMBOL, WITH TOLERANCE** — not a decimal-place count. **GCD recovers the actual increment whatever its shape and is guaranteed to nest.** Fall back to decimal places only if unstable, **and say so in the record.**

**Two conditions, both Langston's:** **per-symbol, NOT across the 476** (my r3 text was ambiguous) · **"well-observed" carries a STATED n AND WINDOW** or it is the unbounded-observation trap.

✅ **The 4-decimal positive control PASSES and Langston verified it rather than accepting it:** the xStock ticker columns are `numeric(20,8)` — **the column can express 8 decimals and returned 4, so the storage layer is not the cap.** He raised that objection himself and killed it.

---

## 8. FINDINGS THIS BATCH SURFACES BUT DOES NOT FIX — EACH WITH A HOME (§9.4)

- **`B-MIN-STOP-DISTANCE` — a MINIMUM STOP DISTANCE FLOOR.** ★ Langston's knock-on from Q3, and it is **rule 24 outcome (2): working-as-designed but unaddressed — a DECISION, not a defect.** **If gridding moves a stop distance by 12.96%, that stop sat within a few ticks of entry.** A K-tick floor. ⚠️ **It is ALSO the residual §5 names** — the 15/398 that still drift >1% under chain-preserving rounding are these same trades. **HOME: `B-MIN-STOP-DISTANCE`, owner CC-C, placed in `PHASE_19_PLAN.md` §1 Part F immediately AFTER `F-G-2`, before `F-5`.** ⛔ **THE FLOOR IS CC-C + LANGSTON'S TO SETTLE, NOT KYLE'S (Kyle, 2026-08-27): *"Don't put it to me for a number. This is something that you and Langston need to work together on to decide. If you need outside help, look at what trading firms are already doing."* Escalating a technical parameter to him is the §6.7 failure mode.** 

  **✅ RESEARCH DONE + MEASURED — PROPOSAL: A SPREAD-RELATIVE FLOOR OF `3 × spread`, NOT A TICK COUNT.** **Industry practice** ([MQL5 Trading Systems, 2026-08](https://www.mql5.com/en/blogs/post/774799)) states the working heuristic as **stop distance ≥ 3× the current spread**, explicitly as a safety heuristic rather than a law, varying by instrument and timeframe — and warns that **a venue-reported minimum of zero does not guarantee every stop distance is accepted, so the system needs its OWN floor.** ★ **Spread-relative, not tick-count, is the right SHAPE: it scales with the instrument automatically, where a fixed K would be punitive on a tight pair and useless on a wide one.** **MEASURED on our own book — 290 closed crypto trades matched to their symbol's 3-day mean relative spread: median stop distance = 29.9× spread; only 1.7% (5 trades) fall under 3×; 0.3% (1 trade) is inside a single spread; minimum 0.77×.** ⇒ **the floor binds RARELY and would not reshape the strategy population.** 

  ⚠️ **A TICK-COUNT FLOOR WAS TESTED AND IS NOT NEEDED — and this corrects my own first reading.** I initially measured a `<20 ticks` probe against the 3× spread rule, found the populations diverging (4 tick-tight-but-spread-fine) and concluded BOTH floors were required. **Re-tested across thresholds, that divergence is an ARTEFACT OF THE PROBE VALUE:** at `<5 ticks` the tick-tight set is **1 trade, all of it already inside the spread-tight set**; at `<10 ticks`, **2 trades, again a strict subset (tick-only = 0)**. Divergence appears only at `<20`+, where the tick floor starts rejecting economically sound trades. ⇒ **at any genuinely tight threshold the spread floor STRICTLY DOMINATES; a second tick floor buys nothing and costs good trades.** ★ **This is exactly the 6b check — the first cut did not discriminate because I never asked whether the result survived a different probe value.** 

  ⛔⛔ **AND §8 WAS WRONG IN ITS PREMISE — A MINIMUM STOP FLOOR ALREADY EXISTS AND HAS FOR BATCHES. VERIFIED AT THE CODE, NOT TAKEN:** `strategy-helpers.ts:25` **`MIN_STOP_DISTANCE_BPS: 30`** (0.3%, GUARD-1, **Batch 18J**, raised 20→30 on 4-LLM consensus), enforced by `validateStopDistance:352-355` inside `applyGlobalGuards` as a **VALIDITY gate that drops on every path including the VTS tag.**

★ **THIS GIVES KYLE'S QUESTION — *"why are we all of a sudden worried about the minimum stop distance where this hasn't been an issue with our trades before?"* — A BETTER ANSWER THAN THE ONE I GAVE HIM. We are NOT suddenly worried: we instituted this floor batches ago and it has been running ever since.** ⚠️ **And it partly answers his CAUTION too: this is a floor we already have, and it has not produced the unexplained impacts he was warning about.**

⇒ **THE OPEN QUESTION IS THE BASIS, NOT WHETHER TO HAVE ONE** — my `0.77x`-spread trade **passed the 0.3% gate cleanly**, so the gate exists and simply is not keyed on spread. ⛔ **RE-HOMED: `B-MIN-STOP-DISTANCE` is a RE-BASIS OF AN EXISTING GATE, NOT A NEW CLAMP.** `RECORD-DO-NOT-MECHANISE` still stands on the evidence (`n=5`, `p=0.060`). ★ **Away-rounding can never breach the existing floor — it only ever widens.**

⛔⛔ **RECOMMENDATION WITHDRAWN AND REPLACED — DO NOT BUILD A FLOOR YET (Kyle's caution, 2026-08-27, and he is right on both counts).**

  **HIS FIRST QUESTION: *"why are we all of a sudden worried about the minimum stop distance where this hasn't been an issue with our trades before? All we're doing now is rounding."*** ✅ **ANSWER: ROUNDING DID NOT CREATE THIS AND THE FINDING IS PRE-EXISTING.** Langston INFERRED it from the rounding tail — a stop whose distance moves 12.96% on gridding must be a few ticks wide — so **the rounding measurement was the FLASHLIGHT, not the cause.** Those stops were equally tight before any of this work. **Nothing about rounding makes them tighter, and F-G-1 does not need this resolved.**

  **HIS SECOND: *"every time we've instituted floors and ceilings, it hasn't worked out well… we put in the floor, we clamp something, and then we end up seeing trading impacts that we're not sure why it's happening."*** ✅ **THE CAUTION IS CORRECT AND IT IS SPECIFICALLY ABOUT CLAMPING.** ⛔ **A floor that WIDENS a too-tight stop hands the trade a geometry NOBODY DESIGNED — the strategy asked for one distance and the system silently substituted another. That is precisely the unexplained-impact failure he describes, and it is the SAME defect `OBJ-7b` refuses when it forbids re-rounding.** ⇒ **IF we ever act on this, the disposition is REJECT (the signal does not trade, and is recorded with its reason), NEVER CLAMP.**

  **AND THE EVIDENCE DOES NOT YET SUPPORT ACTING AT ALL. MEASURED — 290 closed crypto trades banded by stop width in spreads:**

  | band | trades | stopped out | avg net |
  |---|---|---|---|
  | **under 3× spread** | **5** | **80.0%** | **−$3.53** |
  | 3–10× | 22 | 54.5% | +$6.52 |
  | over 10× | 263 | 36.1% | +$0.28 |

  **The gradient is monotonic in stop-out rate and is what theory predicts — but `n = 5`.** ⛔ **Against the 36.1% base rate, 4-of-5 gives a one-sided `p = 0.060`: SUGGESTIVE, NOT SIGNIFICANT.** ⚠️ **And the 3–10× band has the BEST average net of the three while stopping out more often than the wide band, which cuts against a simple tighter-is-worse story.** ★ **Building a mechanism on `n=5` at `p=0.06` is the VOLUME-FLOOR MISTAKE EXACTLY — we declined to threshold the volume ratio on 195 observations; acting here on 5 would be indefensible.**

  ⇒ **DISPOSITION: RECORD, DO NOT MECHANISE.** ① **Stamp the stop's spread-multiple on every signal** — no behaviour change, no clamp, no rejection. ② **RE-ASK TRIGGER, derived not chosen: `n = 10` trades in the under-3× band.** At the same 80% rate that is `p = 0.006` — the smallest n at which the re-ask returns an ANSWER rather than another deferral (`n=5` cannot). **At ~1.7% incidence that is roughly 580 crypto trades.** ③ **If it confirms: REJECT, never clamp.** ④ **Owner CC-C + Langston jointly, per Kyle.**

  ⚠️ **CLARIFICATION, because the phrasing was ambiguous: the multiple is measured FROM THE ENTRY — it is `|entry − stop| ÷ spread`, the stop's own width. It is not a distance from the target, and the target is not involved in this rule at all.**

  **RESIDUAL, STATED: the spread floor does NOT bound rounding-drift** (that is tick-width-driven, a different scale). **It does not need to: chain-preserving rounding already bounds worst-case R drift at 3.57% (§5), with zero trades above 5%.** **Bounded and acceptable ⇒ no second mechanism.** ⛔ **TO LANGSTON, not to Kyle: is 3× right for CRYPTO specifically? The heuristic's home is FX/CFD retail, and our fee ladder (0.80% taker) is a larger frictional term than the spread on most of our pairs — which may argue the floor should key on TOTAL round-trip friction rather than spread alone.**
- **`#917` `B-ASSET-CAPS-REMOVAL` — ✅ Langston's Q5 PRIOR QUESTION IS ANSWERED, and the premise HOLDS.** He required the §9.5(a-ii) census before the scheduling: *does `OBJ-7`/`7b` READ anything `asset-capabilities` WRITES?* **NO. Neither module imports the other; `AutoMappingEntry` is written only at `kraken-asset-pairs-service.ts:401`/`:416` from that service's OWN AssetPairs fetch.** They are independent fetches of the same upstream ⇒ **`asset-capabilities` is upstream of NOTHING F-G reads, and `#917`'s orphan premise stands.** **HOME: `B-ASSET-CAPS-REMOVAL`, owner CC-C, placed AFTER `F-G-1` (not "after F-G", which the split made ambiguous — Langston's objection), before `F-G-2`.**

---

## 9. KNOWN LIMITS, STATED

- **This batch does NOT make any exit decision more correct.** It makes exit decisions **DECIDABLE** (§3) and makes our prices live-valid (§2ii). **The exit fix itself is F-G-2.** ⛔ **§9.1 applies: F-G-1 does NOT change which trades win or lose.**
- **The xStock grid is DERIVED and remains a FLOOR, not a published fact** (§7). Every xStock rounding decision carries that caveat in its record.
- **`OBJ-9` does NOT explain the missing exit minutes** — the traded classes lost ~8 batches in two weeks; the 5,889 are `crypto_perp`, which we do not trade. **The bar instrument was sound before this fix and is sound after it.** OBJ-9 is a real defect found while validating that instrument, not a repair it depended on. ⚠️ **Qualified by OBJ-9⑥: negligible by COUNT is not negligible by CONCENTRATION.**
