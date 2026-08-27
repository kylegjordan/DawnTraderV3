# F-G-2 — B-EXIT-TRANSACTABLE-SIDE — SCOPE (Step 1, r4)

change-class: architecture

> **STATUS: Step 1 r4. This file is the OTHER HALF of the former F-G, and it is the ORIGINAL batch — replace the midpoint at the exit decision.** Langston ruled the split at `cdb783a8d`.
>
> ⛔⛔ **HARD PREREQUISITE: `F-G-1` MUST BE DEPLOYED AND SOAKED BEFORE `OBJ-0`'s SHADOW RUN STARTS.** Not a preference — **`OBJ-0`'s entire read-out is invalid otherwise.** See §1.
>
> ⛔ **OBJECTIVE NUMBERS UNCHANGED** (`OBJ-0`–`OBJ-6`, `OBJ-8`) — Langston's r1/r2/r3 rulings, `#911`, `#914`, `#915` and `PHASE_19_PLAN` all cite them by these names. `OBJ-7`/`7b`/`9` moved to `F-G-1` and are **not** renumbered there either.
>
> ⚠️ **THE FULL AUDIT, PROVENANCE READ AND MEASUREMENT that produced this batch live in the r3 file `B_EXIT_TRANSACTABLE_SIDE_SCOPE.md` at `cdb783a8d`. That file is the HISTORICAL RECORD and is NOT edited further — this one supersedes it. §5.1's provenance finding (the midpoint was BUILT for stability, by directive, and is not a bug) is unchanged and still governs how this batch is framed.**

---

## 1. ⛔ WHY THIS WAITS FOR F-G-1 — THE CONFOUND

**`OBJ-0` is a pre-registered before/after: a 2×2 of old-rule × new-rule exit outcomes, whose DISCORDANT CELL is the kill criterion** — a trade the NEW rule stops out that the OLD rule rode back to `target_hit`.

⛔ **`F-G-1`'s grid rounding MOVES THE STOPS THEMSELVES** — p95 **2.343%**, worst **12.96%** of stop distance. **If gridding lands inside this batch's deploy, the "old rule" arm no longer exists in comparable form.** You cannot run a discordant-cell comparison across a deploy that also moved the geometry being compared.

⇒ **`OBJ-0`'s shadow run happens ENTIRELY INSIDE THE POST-`F-G-1` ERA, so both arms see gridded prices.** ★ **This is the reason for the split. It is not about objective count.**

---

## 2. THE ONE-SENTENCE CASE

**The exit decision reads a MIDPOINT — a price nobody can transact at — while a sell actually fills on the BID.** Measured on the r3 population: **all nine stop-outs filled BELOW their stop, median 0.17%.** The exits are systematically worse than the levels we set.

⛔ **THIS IS NOT A BUG FIX AND MUST NOT BE SCOPED AS ONE.** The provenance read (r3 §5.1) established from the introducing directive that the midpoint was **built deliberately, for STABILITY**, with named consumers that were display and analytics. **A second consumer later read it for a decision it was never built to serve.** Rule 24 outcome **(3)**: legacy that no longer fits today's intent.

---

## 3. OBJECTIVES

| # | objective | verification criterion |
|---|---|---|
| **OBJ-0** | ⛔ **MEASURE THE BEHAVIOUR CHANGE BEFORE SHIPPING IT — SHADOW FIRST, SWITCH SECOND.** Deciding on the transactable side moves when trades exit, in OPPOSITE directions for the two exit types: for a long, **stops fire EARLIER and targets fire LATER.** Not telemetry — it changes the trade population. ⛔ **RUNS ONLY AFTER `F-G-1` IS DEPLOYED (§1).** | ⛔ **PRE-REGISTRATION, rewritten at r2 after Langston holed r1 on three counts:** (a) **WRONG SIDE** — stops firing earlier IS the intended behaviour, so gating on a rise in stop count would reject the batch for succeeding; (b) **ONE METRIC ON A TWO-SIDED CHANGE** — targets firing later needs its own read-out; (c) **NO n-FLOOR AND NO WINDOW RULE** (`#661` leg 2). ⇒ ① **THE DISCORDANT CELL IS THE KILL CRITERION** — a trade the NEW rule stops out that the OLD rule rode back to `target_hit`. **The only cell where the change destroys value.** ② **Both exit types reported separately, never netted.** ③ **n-floor and window span set at Step 2 from the exit rate, BEFORE the shadow runs.** ④ **Every cell of the 2×2 published, including those that favour the change.** |
| **OBJ-1** | **The exit DECISION for a long reads the BID, not the mid** — the side we actually transact on. Stop, target and trailing alike. ✅ **Not gated by `F-G-1`: bid-vs-mid is unaffected by gridding (Langston Q1 — my r3 dependency graph had this wrong).** | Every post-deploy exit decision cites a bid-derived price in its provenance stamp (`B-EXIT-PROVENANCE`, `#911`). ⚠️ **A target's FILL price was already correct — it is a resting maker order filling at our own ask. It is the TRIGGER that reads the mid, so we may book wins nobody paid for. Different failure from the stop, same cause; both are in scope.** |
| **OBJ-2** | ⛔⛔ **THE LABEL MUST BECOME HONEST.** `8.9.4-Patch` ships `{ a:[bestAsk], b:[bestBid], c:[midpoint] }` and **in Kraken's ticker schema `c` IS THE LAST-TRADE FIELD.** `8.9.1` does the identical substitution in the translator. ⇒ **the midpoint was published UNDER THE NAME OF A TRADED PRICE, twice, by two directives eight months apart.** ⚠️ `kraken-websocket-adapter.ts:681` still names the variable `lastPrice` while holding a mid. | ⛔ **THE FENCE ASSERTS THE LABEL, NOT THE CONSUMER SET.** A field named for a traded price carries one, or is renamed to what it holds. **Consumer-counting is the weaker test and would pass a correctly-read wrong value — which is exactly how this survived eight months: NO DOWNSTREAM READER WAS MISBEHAVING.** ★ The mid legitimately survives for charts and smoothed series, **under an honest name.** ⚠️ **Kyle's correction: anything that becomes a price we TRANSACT at — signal-time entry, stop, target, trigger — needs the transactable side. My r1 claim that "the mid stays for signal generation" was WRONG.** |
| **OBJ-3** | **BOTH ASSET CLASSES.** crypto via the WS book's bid; xStock via the equities tick's bid. r3 §2 established that three of four lane/class combinations decide on a mid, by two different mechanisms. | Both classes verified independently on live post-deploy rows. **Neither class may be discharged by the other's evidence.** |
| **OBJ-4** | **DO NOT FORK THE SHARED EXIT DECISION.** `evaluateTECExit` is imported by BOTH `vts-runner.ts:48` and `active-execution-engine.ts:59`. Side-selection lives in ONE place with a parity test. | A parity fence proves both callers resolve the same side for the same inputs. ⛔ **A per-lane copy is the `#641` two-copies shape and fails this objective even if every test passes.** |
| **OBJ-5** | **VTS DISPOSITION IS DECIDED AND WRITTEN DOWN — not left implicit.** VTS and paper are separate systems and must never be blended (Kyle, standing). Changing VTS mid-stream splits its series. | An explicit, recorded decision — change it, or leave it and record the difference. ★ **Informed by `#914`: VTS has NO FILL LAYER AT ALL — 999/999 stops fill at exactly the stop price. It is a world where exiting is free, which is why it was never a calibration surface for this.** |
| **OBJ-6** | **The change is measurable after the fact.** `B-EXIT-PROVENANCE` stamps the decision price, its producer and an independent witness on every close. | A before/after read on stamped rows. ⚠️ **`B-EXIT-PROVENANCE` must be CLOSED first — it still needs one post-`ed86a758e` close showing the `#911` witness populated.** |
| **OBJ-8** | ⛔⛔ **HOW WE DECIDE A SIMULATED EXIT FILLED — THE INSTRUMENT.** ⛔ **WE CAN NEVER PROVE A PAPER FILL — no counterparty exists.** ★ **Kyle's framing makes it answerable: that limit is GLOBAL to paper AND VTS, applies to every candidate equally, and therefore DOES NOT DISCRIMINATE. The question is which ESTIMATOR is least wrong and whether it is LABELLED honestly.** **INSTRUMENT = the 1-MINUTE OHLC BAR's `high`, plus `volume`/`trade_count`.** ⛔ **DEPENDS ON `F-G-1`: through-not-touch is a PLACEBO on off-grid limits (`F-G-1` §3).** | ① **THROUGH, NOT TOUCH** — the named industry standard (TradingView `backtest_fill_limits_assumption`). **Fence: count exact `high == limit` — ~0 before `F-G-1`, non-zero after.** ② ⛔ **NAME IT WHAT IT PROVES — `traded_through_at`, NEVER `fill_confirmed`.** "Filled" on trade-through evidence is `OBJ-2`'s mislabelling in a new costume, inside the batch that exists to end it. ③ ⛔ **SHIP AS A DOCUMENTED CONSERVATIVE PROXY — through-not-touch NARROWS Langston's objection (1), it does not CLOSE it:** queue position is size-ahead vs size-through and *"N ticks through"* measures neither. **Do not let "industry standard" do the work of "measured."** ④ **RECORD THE VOLUME RATIO, DO NOT THRESHOLD IT** — measured 195 matched crypto exits: **median 18.1× · p10 0.4× · p90 1001×.** ⚠️ A $100k floor was proposed and **WITHDRAWN** — a number chosen only so as not to be zero. ⑤ **POPULATION = ACTIVE PAPER ONLY** — confirmed, not assumed: the shadow resolver reuses the same `evaluateTECExit` (`vts-runner.ts:3752`) **but VTS has no fill layer (`#914`) and shadows have their OWN price fetch** ⇒ measuring fill realism there would measure nothing. ⚠️ **Shadows ARE live despite a code comment saying dormant — 47,500 pairings, newest 2026-08-27.** ⑥ ⚠️ **CONSERVATIVE-DIRECTION DEFECT, NOTED NOT FIXED:** the bar writer has no re-entrancy guard and overwrites `high` rather than `GREATEST` (`ohlc-batch-writer.ts:170`) ⇒ an out-of-order flush can bias a high DOWN — **fewer fills, never more.** |

---

## 4. ⛔ THE RE-ASK TRIGGER FOR `OBJ-8`④ — SETTLED, WITH LANGSTON'S DERIVATION

**Langston's r3 condition was that a recorded number with no re-ask is a column nobody queries — it needs an owner AND a trigger.**

⚠️ **CORRECTION TO MY OWN r3 RECORD: I wrote that Kyle had RULED the trigger must be N trades rather than a date. He had NOT — he SUGGESTED it as an alternative and has since said it may go either way provided the evidence is sufficient to act on. Reporting a suggestion as a ruling is how a constraint nobody set becomes load-bearing.** Langston's derivation is unaffected because it argues from decision power, not from Kyle's framing.

**✅ TRIGGER: `N = 400` matched active-paper exits, pooled across both classes, reported per class. Owner CC-C.**

**Derivation (so it is not a number chosen not to be zero):** the decision the ratio informs is *does our notional exceed the bar's often enough to gate*; the quantity is `p = P(ratio < 1×)`; the r3 p10 of 0.4× puts `p̂ ≈ 0.10` at `n=195`. CI half-width `1.96·√(p(1−p)/n)`: **n=400 → ±2.9pp** (separates 10% from 5% and from 16% — the range where the answer changes) · **n=100 → ±5.9pp**, which cannot tell 4% from 16%, **so the re-ask returns another deferral** · **n=800 → ±2.1pp**, more than the decision needs.

⛔ **THE COUNTING RULES MATTER MORE THAN N:** ① the counter advances **ONLY where the ratio was actually computed** — an unmatched exit must not advance it, **or you are measuring bar-matching coverage, not fill realism**; ② **active paper only, VTS excluded** (`#914`); ③ **pooled**, because xStock at 219 vs 1,818 admits/3d makes a per-class 400 unreachable — but **any class at n<100 on the trigger is reported UNDERPOWERED and gets no per-class conclusion**; ④ **the counter is QUERY-DERIVABLE from the recorded column, never a tally anyone maintains.**

---

## 5. OPEN QUESTIONS FOR LANGSTON — F-G-2

**Q1.** `OBJ-0`'s **n-floor and window span** are due at Step 2. **Is the exit rate stable enough post-`F-G-1` to set them, or does the n-floor need re-deriving on the gridded population?** Gridding changes stop-out timing, so the pre-`F-G-1` exit rate may be the wrong basis.

**Q2.** `OBJ-6` depends on `B-EXIT-PROVENANCE` closing, which needs one post-`ed86a758e` close with the witness populated. **If that has still not arrived by Step 2, does `OBJ-6` gate the batch or degrade to a stated limit?**

**Q3.** `OBJ-5` — my inclination is **leave VTS unchanged and record the difference**, on the grounds that `#914` makes it a non-surface for fill realism and changing it splits the learning series mid-stream. **Confirm or overrule.**

---

## 6. KNOWN LIMITS, STATED

- **`OBJ-8` ships a PROXY, not a proof.** We cannot prove a paper fill. The objective is an estimator that is honestly labelled and conservatively biased — **not a fill confirmation, and the column name must never imply one.**
- **`OBJ-0` can sink this batch, by design.** If the discordant cell shows the new rule stopping out trades the old rule rode to target, **that is the batch failing its own pre-registered test and it does not ship.**
- **The r3 §4/§4b staleness carries forward:** those sections were written when the instrument was the ticker archive. **`OBJ-8` supersedes that.** What survives unchanged is §4b's finding that the archiver bypasses the translator and retains a REAL traded price — **still true, still load-bearing for `OBJ-2`.**
