# F-G-2 — B-EXIT-TRANSACTABLE-SIDE — SCOPE (Step 1, r9)

change-class: architecture

> **STATUS: Step 1 r6 — Langston CHANGES-NEEDED on r5 discharged; see §8. §2 REWRITTEN on the mechanism (BLOCKER-1), `OBJ-9` added (BLOCKER-4), `OBJ-3` amended (BLOCKER-3).** r5 was the fresh-reader pass, §7. r4 said: Step 1 r4. This file is the OTHER HALF of the former F-G, and it is the ORIGINAL batch — replace the midpoint at the exit decision.** Langston ruled the split at `cdb783a8d`.
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

**THE EXIT DECIDES ON A BOOK MIDPOINT — A PRICE NOBODY CAN TRANSACT AT — WHILE A SELL FILLS ON THE BID.**

✅ **THE DISCRIMINATING MEASUREMENT (r7 — the r6 instrument could not fail; see §8.6):**

```
exit_decision_price = exit_book_mid      12 of 12 crypto, exactly
exit_decision_price ≠ exit_ticker_bid     9 of  9 crypto carrying a bid
```

★ **Two INDEPENDENT columns, and they disagree in the direction the batch claims.** ⛔ **This is the same witness §8.4 mandates for `OBJ-1` — the evidence and the acceptance test are now the same instrument, deliberately.**

✅ **MECHANISM, cited (29(c)):** `active-execution-engine.ts:768` `const currentPrice = priceResult?.price ?? null` → passed to `evaluateTECExit` at `:1705` → stamped `exitDecisionPrice` at `:2263`. **For crypto that price is produced by `kraken_ws_book_mid` (`kraken-websocket-adapter.ts:945`).**

⚠️ **CRYPTO-ONLY, AND THIS COMPOUNDS `BLOCKER-3` RATHER THAN BEING COVERED BY IT (Langston):** xStock's producer is `kraken_equities_ws` — **a SOURCE, not a SIDE** — and `exit_book_mid` is **NULL on all 9**. ⛔ **§2's case has NO xStock evidence at all.**

---

### ⛔⛔ THE ERA SPLIT IS THE FINDING — AND MY OWN r5 "CORRECTION" DESTROYED IT

**r5 said the headline was wrong (64.9%, 0.057%). r6 built on that. BOTH WERE THE ERROR: I pooled across a boundary the r3 file had already named, and Langston's `BLOCKER-1` was correct arithmetic on my bad pool.**

✅ **Split at `2026-08-22T22:01Z`** — the epoch `PART_F_REORG:100` states:

| era | n | below stop | median shortfall | above-stop rows |
|---|---|---|---|---|
| **PRE** (`< 22:01Z`) | 50 | 24 = **48.0%** | — | **26** |
| **POST** (`≥ 22:01Z`) | 24 | 24 = **100.0%** | **0.166%** | ⛔ **ZERO** |

⇒ ★★ **PRE-EPOCH IS A COIN FLIP. POST-EPOCH IS 24 OF 24.** **The original scope claim — "all nine below, median 0.17%" — WAS RIGHT; it has since grown to 24 of 24 at 0.166%.**

✅ **AND THE EPOCH IS A KNOWN INSTRUMENT CHANGE, NOT A CHOSEN DATE:** `2026-08-22T22:01Z` is `e6f7c70b3`, **`B-BOOK-TRUNCATE-HOTFIX`**, which Langston independently verified took **crossed book states from 31.08% of 8,452 to 0 of 8,774.** ★ **Before it the "midpoint" was computed from a CROSSED book — garbage — so fills scattered both ways. After it the book is clean and the mid-to-bid gap appears as a consistent one-sided cost.** **That is a mechanism for the split, not a cut chosen to help.**

⚠️ **SO PRE-EPOCH DATA IS NOT A LARGER SAMPLE OF THE SAME THING — IT IS A DIFFERENT INSTRUMENT.** Pooling it is the `wrong-object` pattern, and I committed it while criticising the scope for a number without a population.

### ✅ THE MONEY, WITH THE OBJECT NAMED (Langston condition 2)

⛔ **"Money" is ambiguous here and the two objects point OPPOSITE ways on the pooled population.** Named explicitly, POST-epoch:

| object | definition | POST-epoch (n=24) |
|---|---|---|
| **stop-gap value** | `Σ quantity × (actual_exit − original_stop)` | **−$11.28** |
| **`net_pnl`** | the booked P&L of the same rows | **−$121.96** |

✅ **Post-epoch they agree in sign** — both costs. ⚠️ **On the POOLED 74 they did not** (+$60.55 stop-gap against −$270.91 `net_pnl`), **which is exactly why the object must be named: a column headed "money" beside a row headed "net" becomes "the fix costs us money" two documents later.**


### ⛔⛔ r8 — THE POST-EPOCH POOL STRADDLES A **SECOND** INSTRUMENT CHANGE (Langston, after withdrawing BLOCKER-1)

**I split at one boundary and did not ask whether there was another. There was, and it is F-G-1's own deploy** — the VPG rounds **stop AWAY from entry**, moving the very price the fill is measured against.

✅ **SPLIT AGAIN at `2026-08-28T16:08:02Z`:**

| era | n | below stop | median shortfall |
|---|---|---|---|
| post-book-fix, **PRE-GRID** (`22-08 22:01Z → 28-08 16:08Z`) | **23** | 23 = 100% | **0.161%** |
| **POST-GRID** (`≥ 28-08 16:08:02Z`) | ⛔ **1** | 1 = 100% | 0.227% |

⇒ ⛔ **23 OF THE 24 ARE PRE-GRID. THE POST-GRID EVIDENCE IS n=1.** ★ **The direction is unchanged — both sub-eras are 100% below — but "24 of 24" must never be read as a statement about TODAY'S system.** ⚠️ **Same finding one level down: I corrected a pooled number by pooling a smaller one.**

### ⚠️ THE MECHANISM CITATION NEEDS ITS MEASUREMENT WINDOWS DATED (Langston, item 2 — NOT YET DISCHARGED)

The `31.08% → 0` crossed-book verification is **Langston's**, and he flags that **if the zero leg was measured after `B-MBIM-SWITCH-ON` (`afb7d326c`, 08-24) it is not comparable** — the checksum-mismatch arm `continue`s ABOVE the crossed detector, so a resubscribing update never reaches the counter and **a zero after ≠ a clean book.**

⛔ **BOTH LEGS' WINDOWS MUST BE STATED BEFORE THE COUNTER IS CITED.** ✅ **The fill-distribution shift at `e6f7c70b3` is INDEPENDENT evidence and probably carries the era split on its own** — but the crossed-book counter may not be the load-bearing leg unadorned. **Owed at Step 2.**

### ⛔ `−$11.28` IS A **BASIS** FIGURE, NOT A REALISED COST (Langston, item 3 — ADOPTED)

**If `exit_decision_price = exit_book_mid` (12/12) and the stop is bid-referenced, then a 0.166% median shortfall is THE HALF-SPREAD BY CONSTRUCTION — an accounting difference between two reference prices, not money lost.**

⛔ **So it is renamed: `mid-vs-bid BASIS GAP`, never "cost".** ✅ **Condition 1's discriminating pair is exactly what settles which it is** — and until that lands, **no figure from this row may be reported as a loss.** ⚠️ **`net_pnl −$121.96` is a genuine realised number and is a DIFFERENT object; the two must not be summed or compared.**

⚠️ **ALL POST-EPOCH FIGURES ABOVE ARE `RULED ON REPORTED FACT` and Langston has flagged that as DISQUALIFYING at Step 4 since they enable the proceed. He re-derives them there.**


### ✅ r9 — ITEM 2 DISCHARGED BY LANGSTON, AND THE CAVEAT IS **RATE-DEPENDENT**, NOT BINARY

✅ **HIS PAIR IS CLEAN. The zero leg is at `e6f7c70b3`, BEFORE `afb7d326c`** — three legs, one self-dating:

1. **The denominator dates itself.** `0 of 8,774` carries `checksum mismatch 8,774/8,774` — a **100%-mismatch population is the PRE-precision signature** (`symbolPrecision` unpopulated, `String(qty)` cannot reconstruct the CRC input). Post-precision the same endpoint reads **18,758/18,758 MATCHES**. ⇒ **that population cannot exist after the MBIM deploy.**
2. **The record predates the deploy** — `GOVERNANCE_EXCEPTIONS.md:29`, stamped `2026-08-23T11:00:00Z`, already carries `0 of 8,774`; `afb7d326c` deployed 08-24.
3. ★ **THE STRUCTURAL LEG, which decides it:** at `e6f7c70b3` the mismatch arm did **NOT** `continue` — the fix item reads *"compute Kraken's checksum and COUNT match/mismatch — OBSERVE ONLY, never resubscribe"*. The `softResubscribe` + `continue` entered at the MBIM deploy (adapter `:850-856`, *"Corrected 2026-08-24"*). **So the crossed detector at `:884` was REACHABLE for all 8,774 updates.**

⛔⛔ **AND THE INVERSE IS WHY IT MATTERED: had that arm been live in that build, the counter would have read `0` BY CONSTRUCTION on 100% of updates — perfectly blind, perfectly reassuring, and INDISTINGUISHABLE FROM THE NUMBER HE ACTUALLY GOT.**

⇒ ✅ **STANDING RULE, replacing r8's flat "not comparable" — which would have been read as "unusable" when the instrument is still good: THE BLINDNESS IS RATE-DEPENDENT. The blind fraction is exactly `mismatches / updatesApplied`.** ⛔ **NEVER QUOTE `crossedDetections` WITHOUT THE MISMATCH COUNT BESIDE IT.**

### ⛔⛔ r9 — `OBJ-0` HAS NO READ-OUT YET, AND THE 23 PRE-GRID ROWS ARE A DIFFERENT INSTRUMENT

**Langston sharpens item 1 beyond a sample-size note: F-G-1 MOVES THE STOP PRICE THE FILL IS MEASURED AGAINST, so the 23 pre-grid rows measure a stop the system NO LONGER EMITS.** ★ **A different instrument, not older data — the same logic as the epoch split, one level down.**

⇒ ✅ **`OBJ-0` HAS NO READ-OUT.** ⛔ **DO NOT MINT A SECOND GATE:** ride **F-G-1's own pre-registered accrual** (30 crypto positions or 7 days, alert `2093a98a`). `PHASE_19_PLAN.md:36` already carries the hard prerequisite.

### ✅ r9 — THE BASIS-GAP TEST, PRE-REGISTERED **BEFORE** CONDITION 1'S DATA LANDS

⛔ **A prohibition is weaker than a prediction, so item 3 becomes a falsifiable test rather than a rule about wording (Langston).**

**IF the 0.166% median shortfall is the half-spread by construction, it PREDICTS a ≈0.33% spread on those names at their exit timestamps.**

✅ **MEASURE IT.** ⇒ **If the measured half-spread comes in MATERIALLY BELOW 0.166%, the residual is NOT accounting and there is something real underneath.**

⚠️ **PRE-REGISTERED NOW, BEFORE THE DATA, precisely so it cannot become a post-hoc fit** — which is the whole reason it is written here rather than decided at read time.

### ✅ RULE-24 CLASSIFICATION — RESTORED AND CORRECTED (§9, 2026-08-29)

⛔ **OUTCOME (1) ON THE SUBSTITUTION, not outcome (3) on the midpoint.** ★ **The midpoint's own intent is SOUND and stays** — a stale last-trade is the wrong number for marking a low-volume pair (§9.1). **What is defective is that `b4c0d2d67` changed the MEANING of `c` underneath an exit-decision consumer that had been reading it since `cb8ee0942`, eleven weeks earlier** (§9.2), and that neither map records the change (§9.4). ⇒ **The remedy is unchanged — give the exit its own transactable price — but it is a DEFECT FIX, not a legacy retirement, and Step 2 states it that way.**

### ⚠️ THE HONEST CONSEQUENCE — DIRECTION EXPECTED, MAGNITUDE UNKNOWN (Langston's amendment)

⛔ **r6 said the fix "MAY reduce measured P&L". That is softer than the measurement warrants.** **Moving a long's exit decision from mid to bid fires stops EARLIER — mechanically.** ⇒ **the below arm grows and any above arm shrinks. THE DIRECTION IS EXPECTED; ONLY THE MAGNITUDE IS UNKNOWN.**

★ **This is not an argument against the fix — deciding on an untransactable price is wrong whichever way the money lands — but it must be on the page BEFORE the shadow run, not discovered inside it.**

---

## 3. OBJECTIVES

| # | objective | verification criterion |
|---|---|---|
| **OBJ-0** | ⛔ **MEASURE THE BEHAVIOUR CHANGE BEFORE SHIPPING IT — SHADOW FIRST, SWITCH SECOND.** Deciding on the transactable side moves when trades exit, in OPPOSITE directions for the two exit types: for a long, **stops fire EARLIER and targets fire LATER.** Not telemetry — it changes the trade population. ⛔ **RUNS ONLY AFTER `F-G-1` IS DEPLOYED (§1).** | ⛔ **PRE-REGISTRATION, rewritten at r2 after Langston holed r1 on three counts:** (a) **WRONG SIDE** — stops firing earlier IS the intended behaviour, so gating on a rise in stop count would reject the batch for succeeding; (b) **ONE METRIC ON A TWO-SIDED CHANGE** — targets firing later needs its own read-out; (c) **NO n-FLOOR AND NO WINDOW RULE** (`#661` leg 2). ⇒ ① **THE DISCORDANT CELL IS THE KILL CRITERION** — a trade the NEW rule stops out that the OLD rule rode back to `target_hit`. **The only cell where the change destroys value.** ② **Both exit types reported separately, never netted.** ③ **n-floor and window span set at Step 2 from the exit rate, BEFORE the shadow runs.** ④ **Every cell of the 2×2 published, including those that favour the change.** |
| **OBJ-1** | **The exit DECISION for a long reads the BID, not the mid** — the side we actually transact on. Stop, target and trailing alike. ✅ **Not gated by `F-G-1`: bid-vs-mid is unaffected by gridding (Langston Q1 — my r3 dependency graph had this wrong).** | Every post-deploy exit decision cites a bid-derived price in its provenance stamp (`B-EXIT-PROVENANCE`, `#911`). ⚠️ **A target's FILL price was already correct — it is a resting maker order filling at our own ask. It is the TRIGGER that reads the mid, so we may book wins nobody paid for. Different failure from the stop, same cause; both are in scope.** |
| **OBJ-2** | ⛔⛔ **THE LABEL MUST BECOME HONEST.** `8.9.4-Patch` ships `{ a:[bestAsk], b:[bestBid], c:[midpoint] }` and **in Kraken's ticker schema `c` IS THE LAST-TRADE FIELD.** `8.9.1` does the identical substitution in the translator. ⇒ **the midpoint was published UNDER THE NAME OF A TRADED PRICE, twice, by two directives eight months apart.** ⚠️ `kraken-websocket-adapter.ts:681` still names the variable `lastPrice` while holding a mid. | ⛔ **THE FENCE ASSERTS THE LABEL, NOT THE CONSUMER SET.** A field named for a traded price carries one, or is renamed to what it holds. **Consumer-counting is the weaker test and would pass a correctly-read wrong value — which is exactly how this survived eight months: NO DOWNSTREAM READER WAS MISBEHAVING.** ★ The mid legitimately survives for charts and smoothed series, **under an honest name.** ⚠️ **Kyle's correction: anything that becomes a price we TRANSACT at — signal-time entry, stop, target, trigger — needs the transactable side. My r1 claim that "the mid stays for signal generation" was WRONG.** |
| **OBJ-3** | **BOTH ASSET CLASSES.** crypto via the WS book's bid; xStock via the equities tick's bid. r3 §2 established that three of four lane/class combinations decide on a mid, by two different mechanisms. | Both classes verified independently on live post-deploy rows. **Neither class may be discharged by the other's evidence.** ⛔⛔ **r6 BLOCKER-3 (Langston, re-derived by me): THERE IS NO xSTOCK INSTRUMENT TODAY — **0 of 144** xStock `stop_hit` closes carry `original_stop_price`, against **74 of 165** for crypto.** ★ **So this criterion is UNSATISFIABLE for xStock as written, and “neither class discharged by the other” makes that fatal rather than partial.** ⇒ **RESOLVE IN SCOPE, NOT AT STEP 8: either wire the xStock stop reference first (its own prerequisite), or restate OBJ-3 as crypto-only with the xStock gap named as a stated limit.** ⚠️ **It must not be discovered at verification time.** Needs an n-floor too (§7.8). |
| **OBJ-4** | **DO NOT FORK THE SHARED EXIT DECISION.** `evaluateTECExit` is imported by BOTH `vts-runner.ts:51` and `active-execution-engine.ts:59` — **and there are THREE CALL SITES, not two: `vts-runner.ts:3101` (real resolver), `vts-runner.ts:3882` (shadow resolver), `active-execution-engine.ts:1705`.** Side-selection lives in ONE place with a parity test. | A parity fence proves both callers resolve the same side for the same inputs. ⛔ **A per-lane copy is the `#641` two-copies shape and fails this objective even if every test passes.** |
| **OBJ-5** | **VTS DISPOSITION IS DECIDED AND WRITTEN DOWN — not left implicit.** VTS and paper are separate systems and must never be blended (Kyle, standing). Changing VTS mid-stream splits its series. | An explicit, recorded decision — change it, or leave it and record the difference. ★ **Informed by `#914`: VTS has NO FILL LAYER AT ALL — 999/999 stops fill at exactly the stop price. It is a world where exiting is free, which is why it was never a calibration surface for this.** |
| **OBJ-6** | **The change is measurable after the fact.** `B-EXIT-PROVENANCE` stamps the decision price, its producer and an independent witness on every close. | A before/after read on stamped rows. ⚠️ **`B-EXIT-PROVENANCE` must be CLOSED first — it still needs one post-`ed86a758e` close showing the `#911` witness populated.** |
| **OBJ-8** | ⛔⛔ **HOW WE DECIDE A SIMULATED EXIT FILLED — THE INSTRUMENT.** ⛔ **WE CAN NEVER PROVE A PAPER FILL — no counterparty exists.** ★ **Kyle's framing makes it answerable: that limit is GLOBAL to paper AND VTS, applies to every candidate equally, and therefore DOES NOT DISCRIMINATE. The question is which ESTIMATOR is least wrong and whether it is LABELLED honestly.** **INSTRUMENT = the 1-MINUTE OHLC BAR's `high`, plus `volume`/`trade_count`.** ⛔ **DEPENDS ON `F-G-1`: through-not-touch is a PLACEBO on off-grid limits (`F-G-1` §3).** | ① **THROUGH, NOT TOUCH** — the named industry standard (TradingView `backtest_fill_limits_assumption`). **Fence: count exact `high == limit` — ~0 before `F-G-1`, non-zero after.** ② ⛔ **NAME IT WHAT IT PROVES — `traded_through_at`, NEVER `fill_confirmed`.** "Filled" on trade-through evidence is `OBJ-2`'s mislabelling in a new costume, inside the batch that exists to end it. ③ ⛔ **SHIP AS A DOCUMENTED CONSERVATIVE PROXY — through-not-touch NARROWS Langston's objection (1), it does not CLOSE it:** queue position is size-ahead vs size-through and *"N ticks through"* measures neither. **Do not let "industry standard" do the work of "measured."** ④ **RECORD THE VOLUME RATIO, DO NOT THRESHOLD IT** — measured 195 matched crypto exits: **median 18.1× · p10 0.4× · p90 1001×.** ⚠️ A $100k floor was proposed and **WITHDRAWN** — a number chosen only so as not to be zero. ⑤ **POPULATION = ACTIVE PAPER ONLY** — confirmed, not assumed: the shadow resolver reuses the same `evaluateTECExit` (`vts-runner.ts:3882`) **but VTS has no fill layer (`#914`) and shadows have their OWN price fetch** ⇒ measuring fill realism there would measure nothing. ⚠️ **Shadows ARE live despite a code comment saying dormant — 47,500 pairings, newest 2026-08-27.** ⑥ ⚠️ **CONSERVATIVE-DIRECTION DEFECT, NOTED NOT FIXED:** the bar writer overwrites `high` rather than `GREATEST` — `server/services/passive-archive/ohlc-batch-writer.ts:302`, `high: sql`EXCLUDED.high`` inside an `onConflictDoUpdate` ⇒ an out-of-order flush can bias a high DOWN — **fewer fills, never more.** |
| **OBJ-9** | ⛔⛔ **NEW IN r6 (Langston BLOCKER-4) — EXPLAIN THE ABOVE-STOP TAIL BEFORE `OBJ-0` RUNS.** 26 of 74 crypto stop-outs (35.1%) exit a median **2.844%** ABOVE their stop, worst 9.13%, worth **+$83.26** — against the below-stop arm's −$22.71. ★ **A stop-out exiting 2.8% away from its stop is NOT a fill mechanic.** ⇒ **`OBJ-0`'s discordant cell cannot attribute a before/after difference to side-selection while a third of stop-outs exit by an unexplained mechanism.** | **Name the mechanism, with a `file:line`, or state it unexplained.** Candidates to eliminate, not to assume: gap-through on a thin book · the 24h max-hold time-exit (`#550`) mis-labelled `stop_hit` · a trailing ratchet having moved the stop after `original_stop_price` was recorded (`#923`) · exit-decision price and fill price disagreeing. ⛔ **DELIVERABLE IS AN ATTRIBUTION, NOT A NUMBER.** ➕➕ **RESTATED AT r7 — THE TAIL IS ENTIRELY PRE-EPOCH AND THAT CHANGES ITS URGENCY, NOT ITS OBLIGATION: ALL 26 above-stop rows sit BEFORE `2026-08-22T22:01Z`; POST-epoch there are ZERO.** ★ **So it is very likely an artifact of the crossed-book era (31.08%→0 at `e6f7c70b3`) rather than a live mechanism** ⇒ **it no longer threatens `OBJ-0`'s post-epoch shadow run, and `OBJ-0` is NO LONGER GATED ON IT.** ⚠️ **It is still owed**, because "very likely an artifact" is a hypothesis and the rows are real. ↔ **`#940`** — two of the three wildly-divergent xStock `exit_ticker_bid` rows are `stop_hit`, so the two may share one cause; **neither may be assumed to.** |

---

## 4. ⛔ THE RE-ASK TRIGGER FOR `OBJ-8`④ — SETTLED, WITH LANGSTON'S DERIVATION

**Langston's r3 condition was that a recorded number with no re-ask is a column nobody queries — it needs an owner AND a trigger.**

⚠️ **CORRECTION TO MY OWN r3 RECORD: I wrote that Kyle had RULED the trigger must be N trades rather than a date. He had NOT — he SUGGESTED it as an alternative and has since said it may go either way provided the evidence is sufficient to act on. Reporting a suggestion as a ruling is how a constraint nobody set becomes load-bearing.** Langston's derivation is unaffected because it argues from decision power, not from Kyle's framing.

**✅ TRIGGER: `N = 400` matched active-paper exits, pooled across both classes, reported per class. Owner CC-C.**

**Derivation (so it is not a number chosen not to be zero):** the decision the ratio informs is *does our notional exceed the bar's often enough to gate*; the quantity is `p = P(ratio < 1×)`; the r3 p10 of 0.4× puts `p̂ ≈ 0.10` at `n=195`. CI half-width `1.96·√(p(1−p)/n)`: **n=400 → ±2.9pp** (separates 10% from 5% and from 16% — the range where the answer changes) · **n=100 → ±5.9pp**, which cannot tell 4% from 16%, **so the re-ask returns another deferral** · **n=800 → ±2.1pp**, more than the decision needs.

⛔ **THE COUNTING RULES MATTER MORE THAN N:** ① the counter advances **ONLY where the ratio was actually computed** — an unmatched exit must not advance it, **or you are measuring bar-matching coverage, not fill realism**; ② **active paper only, VTS excluded** (`#914`); ③ **pooled**, because xStock at 219 vs 1,818 admits/3d makes a per-class 400 unreachable — but **any class at n<100 on the trigger is reported UNDERPOWERED and gets no per-class conclusion**; ④ **the counter is QUERY-DERIVABLE from the recorded column, never a tally anyone maintains.**

---

## 7. ⛔ FRESH-READER PASS (2026-08-29) — WHAT IT FOUND AND WHAT I RE-DERIVED

**Kyle directed a second reader over this scope, then that I measure its findings and fix the substantive ones.** A fresh context was handed the document and ONE question — *"what other states of the world are consistent with it?"* — rather than *"is it right?"*, so it could not simply agree. It returned 28 items. ⛔ **A reviewer HIT is a LEAD, not evidence: everything below that MOVED was re-derived by me at `origin/migration/aws-supabase` or against the live DB. Items I could not re-derive are listed UNVERIFIED and have changed nothing.**

### 7.1 ⛔⛔ THE HEADLINE NUMBER HAS NO POPULATION — **LOAD-BEARING: THIS IS §2's ONE-SENTENCE CASE**

§2 says *"all nine stop-outs filled BELOW their stop, median 0.17%"* — **n=9 with no denominator, no window, no class.**

✅ **MEASURED 2026-08-29** — active-paper crypto stop_hit closes carrying BOTH original_stop_price and actual_exit_price:

```
n = 74     below stop = 48 (64.9%)     median shortfall = 0.057%
```

⇒ ⛔ **NOT "all" — 64.9%. NOT 0.17% — 0.057%.**

⛔⛔ **REVERSED AT r7 — THIS ENTIRE SECTION WAS THE ERROR. READ §2 FIRST.** **The scope's original claim was RIGHT and my "correction" here was the wrong-object:** I pooled 74 rows across the `2026-08-22T22:01Z` book-truncate epoch that `PART_F_REORG:100` already named. **Split properly: PRE 48.0% (a coin flip, and a DIFFERENT INSTRUMENT — crossed book 31.08%→0), POST 24 of 24 = 100.0%, median 0.166%.** ★ **I criticised the scope for a number without a population and then produced one with the WRONG population** — and Langston's `BLOCKER-1` was correct arithmetic on my bad pool, so it dissolves with it. ✅ **WHAT SURVIVES FROM THIS SECTION: the original number genuinely carried no stated population, and saying so was right.** ⚠️ Original reasoning kept below so the sequence is auditable. I concluded here that the skew still carried the case. **Langston then split the same 74 by DIRECTION and the aggregate runs the OTHER way (+$60.55).** §2 is rewritten on the MECHANISM; the 64.9% is now supporting evidence only. **What survives from this section: the population defect was real, and “all nine” is gone from the body.** ⚠️ Original reasoning kept below so the sequence is auditable: 64.9% against a ~50% null is a real one-sided skew. **But the case must be restated on a NAMED population, and "all nine" must not survive into Step 2** — a universal asserted on n=9 is exactly the shape that becomes *"we always fill below"* two documents later.

### 7.2 ✅ THREE CITATIONS WERE WRONG — CORRECTED INLINE

| cited | actual | note |
|---|---|---|
| vts-runner.ts:48 | **:51** | :48 is the calibration import. ★ **Almost certainly F-G-1's own doing** — it inserted two imports at :43-44. **The prerequisite batch invalidated the pointer, inside a scope whose sibling exists because a matching name is not a matching thing** |
| vts-runner.ts:3752 | **:3882** | :3752 is `exitReason: string,` — a PARAMETER. It was the sole support for OBJ-8⑤'s population exclusion |
| ohlc-batch-writer.ts:170 | **server/services/passive-archive/ohlc-batch-writer.ts:302** | ⛔ **The PATH was wrong too — the cited file does not exist at the ref.** :170 sits inside an alert-body string; the real write is an unconditional `EXCLUDED.high` in an onConflictDoUpdate |

### 7.3 ➕ OBJ-4's CENSUS IS RIGHT AND UNDERSTATES THE SURFACE

✅ **Two importers is TRUE** (repo-wide, tests excluded). ⛔ **But there are THREE CALL SITES** — vts-runner:3101, vts-runner:3882, active-execution-engine:1705. **A parity fence between two IMPORTERS does not prove the third call site passes the same inputs.** Corrected inline; the fence must be written against CALL SITES.

### 7.4 ⛔⛔ OBJ-2's "TWICE, TWO DIRECTIVES" IS OVERSTATED — IT IS ONE MECHANISM

✅ **The 8.9.1 half is SOLID and I confirmed it:** server/services/market-data/kraken-v2-translator.ts:42 carries the directive in its own docstring, writes markPrice into `c`, and the consuming interface declares `c: [string, string]; // Last trade closed` (kraken-websocket-adapter.ts:53). **A midpoint published under a last-trade name — real, and load-bearing.**

⛔ **The 8.9.4-Patch half did NOT reproduce.** That handler emits **named fields with an HONEST producer label** — `producer: 'kraken_ws_book_mid'`. **It says it is a book mid.** The only {a,b,c} shape in the adapter is the type declaration at :53.

⇒ **"twice, eight months apart" is ONE occurrence stated as a pattern** — and that framing was the rhetorical spine escalating OBJ-2 from a bug to a legacy class. ★ **The finding survives on the 8.9.1 leg alone. The escalation does not.**

### 7.5 ⛔⛔ `c` IS A *CONDITIONAL* MID — AND OBJ-2's FENCE HAS NO BRANCH FOR IT

```
let markPrice = last;
if (bid > 0 && ask > 0) markPrice = (bid + ask) / 2;
```

⇒ **`c` carries a MIDPOINT when the book is two-sided, and a GENUINE LAST-TRADE PRICE when it is one-sided or empty.**

★ **So the field is not mislabelled — it is AMBIGUOUSLY labelled, which is strictly worse: a consumer cannot tell which one it got.**

⛔ **OBJ-2's fence — "a field named for a traded price carries one, or is renamed to what it holds" — CANNOT BE SATISFIED AS WRITTEN: either disposition is false some of the time.** It needs a third option (split the field, or carry the discriminator alongside it). **Raised as Q4 below.**

### 7.6 ⛔⛔ N = 400 RESTS ON A LOWER BOUND READ AS A POINT ESTIMATE

§4 derives n=400 from *"the r3 p10 of 0.4× puts p-hat ≈ 0.10"*.

⛔ **A p10 of 0.4× establishes P(ratio ≤ 0.4×) = 0.10. The quantity the derivation NAMES is P(ratio < 1×), which also contains everything between 0.4× and 1.0× ⇒ p ≥ 0.10, not p = 0.10.**

✅ The CI arithmetic is correct GIVEN p=0.10 (±2.9pp / ±5.9pp / ±2.1pp all check out). ⛔ **At p=0.25 the n=400 half-width is ±4.2pp — which no longer separates the values the derivation says it must.** ⇒ **n=400 may be underpowered for its own stated decision. The honest fix is to derive it from P(ratio<1×) MEASURED directly, not inferred from a decile.**

⚠️ ★ **THIS IS THE SAME SHAPE §4 ITSELF CATCHES AND REJECTS ONE PARAGRAPH EARLIER** — the withdrawn $100k floor, *"a number chosen only so as not to be zero."* **The discipline was applied to the floor and not to the n.** *(And the n<100 per-class underpowered floor carries no derivation at all — it is set at exactly the n the same paragraph calls useless.)*

### 7.7 ⛔ "SOAKED" IS UNFALSIFIABLE AS WRITTEN

The HARD PREREQUISITE says F-G-1 must be **DEPLOYED AND SOAKED**. ✅ §1 derives **deployed-before-start** rigorously — you cannot run a discordant-cell comparison across a deploy that moved the geometry being compared. ⛔ **It derives NOTHING about a soak: no length, no criterion and no reason appears anywhere in the document.** ⇒ **State its criterion or strike the word.** As written it is a gate nobody can declare met — which is how a batch waits forever on an undefined condition.

### 7.8 ⛔ CRITERIA THAT CANNOT FAIL, OR CAN BE DISCHARGED WITHOUT THE THING THEY TEST

| # | the criterion | why it does not discriminate |
|---|---|---|
| OBJ-8① | *"count exact high == limit — ~0 before F-G-1, non-zero after"* | ⛔ **Once F-G-1 grids the limits and the bars come from the same venue, equality becomes MECHANICALLY available.** The count goes non-zero because gridding happened, whether or not through-not-touch is correctly implemented. **And "non-zero" is satisfied by ONE row** |
| OBJ-2 | the label fence | ⛔ **A rename discharges it completely while every consumer keeps reading a mid for a decision.** It cannot fail on behaviour |
| OBJ-1 | *"cites a bid-derived price in its provenance stamp"* | ⛔ **Tests that the STAMP SAYS bid-derived, not that the DECISION USED the bid.** If the stamp is written by the same path that selects the price, **the fence checks the suspect against itself** — which is #911's own objection |
| OBJ-3 | *"verified independently on live post-deploy rows"* | ⛔ **No n-floor, no window.** One row per class satisfies it — conspicuous when OBJ-0 in the same table demands both |

★ **OBJ-5 is a fifth, milder case:** *"change it, or leave it and record the difference"* **passes on BOTH branches** — it tests that something was written down, not that the right thing was decided.

### 7.9 ⚠️ LEADS I COULD **NOT** RE-DERIVE — RECORDED, NOT ACTED ON

- **#914's "999/999 stops fill at exactly the stop".** The reviewer reads #914's own table as **~993/999 with a 1.5% real-slippage tail on crypto-PRE**, plus **119 stop-closes with no originalStopPrice, silently unmeasurable** — i.e. 999 is the MEASURABLE SUBSET, not the population. ⛔ **I could not reproduce either figure: vts_open_trades carries no exit-price column, so my query was against the wrong object and I STOPPED rather than guess.** ⚠️ **If the tail is real, OBJ-5/Q3's premise — VTS as a "non-surface" — weakens, because a 1.5% tail IS a surface.** **Langston should rule; I am not asserting it.**
- **The target-fill claim** — *"a target's FILL price was already correct — a resting maker order filling at our own ask"* — **carries no file:line**, and #914 describes the active exit as a **depth-walked** fill. **If targets depth-walk too, OBJ-1's trigger-only scoping is too narrow.** Unverified.
- ✅ **RESOLVED BY §9 (2026-08-29) — AND THE ANSWER WAS THE OPPOSITE OF THE CLAIM.** The provenance temporal claim — *"a second consumer later read it for a decision it was never built to serve"* — was the entire basis for rule-24 outcome **(3)** rather than **(1)**, and it lives in the superseded r3 file with no commit or date cited here.

### 7.10 ✅ WHAT THE READER CONFIRMED AS SOLID — stated, because a clean is worth knowing

active-execution-engine.ts:59 exact · kraken-websocket-adapter.ts:681 exact and genuinely carrying the mid · the whole 8.9.1 leg of OBJ-2 · ed86a758e is genuinely the #911 witness-wiring commit · OBJ-3's "three of four lane/class combinations" matches r3 §2 exactly · OBJ-4's two-importer census is true at the ref · §1's confound logic is internally valid · OBJ-8②/③'s naming discipline and *"do not let 'industry standard' do the work of 'measured'"* are honest self-limits · and §4's own r3 correction — *"I wrote that Kyle had RULED... He had NOT — he SUGGESTED it"* — is the suggestion-vs-decision discipline applied to itself, unprompted.

---

## 8. ✅ r6 — LANGSTON'S RULINGS ON THE r5 OPEN ITEMS (2026-08-29)

★ **All figures below were re-derived by me at the live DB before anything moved.** His BLOCKER-1 split, the xStock instrument gap and the 12/12 producer count all reproduce exactly.

### 8.1 Q4 — `c` IS THREE-STATE, AND THE ANSWER WAS IN A LINE I HAD ALREADY QUOTED

⛔ **Not two states — THREE:** midpoint · genuine last-trade · **ZERO** (`?? 0` ⇒ `c:["0"]`). **Neither "carry a traded price" nor "rename it" is available.**

✅ **DISPOSITION: CARRY THE DISCRIMINATOR** — adopt the `producer:` label pattern the adapter **already uses at `kraken-websocket-adapter.ts:945`** (`producer: 'kraken_ws_book_mid'`).

⚠️ ★ **I FOUND THAT LINE WHILE REFUTING THE 8.9.4 LEG AND DID NOT NOTICE IT ANSWERED Q4.** The honest-label pattern I cited as evidence *against* one claim was the fix for another, in the same file.

✅ **HONEST LIMIT, STATED SO IT IS NOT INFLATED:** `translateV2ToV1` has **exactly one consumer** (`:680`), which guards `<= 0` at `:685` ⇒ **the zero state reaches nothing today.** Real, contained.

### 8.2 §7.6 — DO NOT PATCH THE ARITHMETIC, CHANGE THE ESTIMAND

✅ `P(ratio < 1×)` **is directly measurable on the same 195 exits that produced the deciles** — it was never necessary to infer it from a p10. **Measure it at Step 2, THEN derive n.** The counting rules ①–④ are the valuable part and they stand unchanged.

✅ **The `n<100` per-class floor is DROPPED — report the per-class CI half-width instead.** ★ **A half-width never needs justifying**, which is precisely what the threshold could not do.

### 8.3 §7.7 — "SOAKED" IS STRUCK, AND NEEDS NO REPLACEMENT INVENTED

⛔ Struck from the HARD PREREQUISITE. ✅ **THE GATE IS: F-G-1's OWN PRE-REGISTERED CRITERION RETURNS `PASS`** — 30 crypto opens or 7 days from `2026-08-28T16:08:02Z`, armed as self-firing alert `2093a98a`.

★ **Falsifiable, owned, and dated by MEASUREMENT rather than by promise** — which is the §9.4 distinction between a window whose length is the content and a date nobody can enforce.

### 8.4 §7.8 — THE FOUR UNFALSIFIABLE CRITERIA, THREE WITH CONSTRUCTIBLE FIXES

| criterion | r6 replacement |
|---|---|
| `OBJ-8`① | ✅ **Replace the equality count with a MUTATION PAIR: touch-only and through-only must return DIFFERENT fill sets on the same bars.** ★ The same proof shape F-G-1 used — a control that cannot fire is the defect it guards against |
| `OBJ-1` | ✅ **USE THE INDEPENDENT WITNESS.** `exit_ticker_bid` exists and is populated ⇒ assert `exit_decision_price ≈ exit_ticker_bid`. **A SECOND instrument, not the suspect checking itself** — which was `#911`'s own objection |
| `OBJ-3` | ⛔ **Needs BLOCKER-3 resolved FIRST** (no xStock instrument at all), then an n-floor |
| `OBJ-5` | ✅ **The criterion becomes: NAME WHAT WOULD CHANGE THE DECISION.** Not "a decision was recorded" — which both branches satisfy |

### 8.5 Q1 / Q2 / Q3 — ANSWERED, WITH THE MEASUREMENTS

**Q1 (OBJ-0's n-floor).** ✅ **74 usable crypto stop-outs over 07-25→08-28 = ~2.2/day carrying a stop reference.** ⇒ **a discordant cell with any power is WEEKS, not days.** Re-derive on the gridded population, but the window arithmetic can start from that order of magnitude now.

**Q2 (OBJ-6 / `B-EXIT-PROVENANCE`).** ⛔ **It does NOT degrade to a stated limit, and the gate is NOT "one close arrived."** Provenance IS landing post-`ed86a758e` — but at **12 of 334** crypto and **9 of 232** xStock, **≈3.6% coverage.** ✅ **THE GATE IS COVERAGE SUFFICIENT FOR A BEFORE/AFTER READ, and the number must be stated at Step 2.** Existence is already proven; sufficiency is not.

**Q3 (VTS disposition).** ✅ **CONFIRMED — leave VTS unchanged and record the difference — but CONDITIONALLY.** §7.9's `#914` lead is unresolved: **if a 1.5% slippage tail is real, "non-surface" is false and Q3 REOPENS.** ⛔ **Resolve at Step 2 against the object that actually holds VTS exit prices** — `vts_open_trades` has no exit-price column, so my query was against the wrong object. ★ **Langston notes this is the same shape as his own crypto-`OBJ-6` retraction; stopping rather than guessing was right.**

---

## 5. OPEN QUESTIONS FOR LANGSTON — F-G-2

**Q1.** `OBJ-0`'s **n-floor and window span** are due at Step 2. **Is the exit rate stable enough post-`F-G-1` to set them, or does the n-floor need re-deriving on the gridded population?** Gridding changes stop-out timing, so the pre-`F-G-1` exit rate may be the wrong basis.

**Q2.** `OBJ-6` depends on `B-EXIT-PROVENANCE` closing, which needs one post-`ed86a758e` close with the witness populated. **If that has still not arrived by Step 2, does `OBJ-6` gate the batch or degrade to a stated limit?**

**Q4 (NEW, r5).** §7.5 — `c` is a CONDITIONAL midpoint, so `OBJ-2`'s fence cannot be satisfied as written: **either disposition is false some of the time.** Split the field, carry a discriminator, or something else? **And §7.9 — if `#914`'s VTS figure really carries a 1.5% slippage tail, does `OBJ-5`/`Q3`'s "non-surface" premise still hold?**

**Q3.** `OBJ-5` — my inclination is **leave VTS unchanged and record the difference**, on the grounds that `#914` makes it a non-surface for fill realism and changing it splits the learning series mid-stream. **Confirm or overrule.**

---

## 6. KNOWN LIMITS, STATED

- **`OBJ-8` ships a PROXY, not a proof.** We cannot prove a paper fill. The objective is an estimator that is honestly labelled and conservatively biased — **not a fill confirmation, and the column name must never imply one.**
- **`OBJ-0` can sink this batch, by design.** If the discordant cell shows the new rule stopping out trades the old rule rode to target, **that is the batch failing its own pre-registered test and it does not ship.**
- **The r3 §4/§4b staleness carries forward:** those sections were written when the instrument was the ticker archive. **`OBJ-8` supersedes that.** What survives unchanged is §4b's finding that the archiver bypasses the translator and retains a REAL traded price — **still true, still load-bearing for `OBJ-2`.**

## 9. ⛔⛔ THE PROVENANCE AUDIT (Kyle-directed, 2026-08-29) — ORIGINAL INTENT IS VALID, AND §2's TEMPORAL CLAIM IS **BACKWARDS**

**Kyle: *"understand the original build intent and determine if it is still valid and if so, is it working as intended."*** Sources consulted: git archaeology · `bridge/canonical/` · `SYSTEM_MANUAL` · `SYSTEM_IMPACT_MAP` · the live code at `origin/migration/aws-supabase` · runtime producer labels.

### 9.1 ✅ ORIGINAL INTENT — FOUND, QUOTED, AND IT IS **SOUND**

**Introducing commit `b4c0d2d67`, 2025-12-30, Replit-era:** *"Improve price calculation for low-volume trading pairs — Update Kraken WebSocket adapters to v2 and **implement midpoint pricing for improved accuracy on low-volume pairs**."* The translator's own docstring names Directive 8.9.1 and the reason: *"Last Trade price… **is often stale on low-volume pairs**."*

✅ **THE INTENT IS STILL VALID AND THIS BATCH MUST NOT PROPOSE REMOVING IT.** A stale last-trade genuinely is the wrong number for marking a position on a pair that trades rarely. ⇒ **rule 24 outcome is NOT "delete the midpoint."**

### 9.2 ⛔⛔ BUT §2's TEMPORAL CLAIM IS BACKWARDS — **THE EXIT CONSUMER CAME FIRST, BY ELEVEN WEEKS**

§2 (inherited from r3 §5.1) says the midpoint had *"named consumers that were display and analytics"* and that **"a second consumer LATER read it for a decision it was never built to serve."**

⛔ **MEASURED — THE OPPOSITE:**

| when | what | evidence |
|---|---|---|
| **2025-10-10** | the paper execution engine reads `tickerData.c[0]` **for its exit decision**, and calls it `// Current price` | `cb8ee0942`, `paper-execution-engine.ts` |
| **2025-12-30** | the **midpoint is substituted INTO `c`** | `b4c0d2d67` |

⇒ ★★ **THE DECISION CONSUMER WAS ALREADY READING THAT FIELD WHEN THE MIDPOINT WAS PUT INTO IT.** **Nothing "later read" anything — the meaning of a field changed underneath a live consumer.**

⛔⛔ **THIS SETS THE RULE-24 CLASSIFICATION — AND THE BATCH CURRENTLY HAS NONE, WHICH I CAUSED.** r4/r6 §2 claimed outcome **(3)** — *legacy that no longer fits today's intent* — in a paragraph my r7 rewrite REPLACED WHOLESALE. ⚠️ **I removed the batch's disposition while fixing its evidence, and only this audit found it: a batch with no stated rule-24 outcome has no disposition at all.** **The archaeology supports outcome (1) on the SUBSTITUTION**: a real defect introduced at `b4c0d2d67`, which fixed a genuine staleness problem for one consumer **and silently changed the semantics for another that was already there.** ⚠️ **The batch's remedy is unchanged; its justification is not, and Step 2 must restate it.**

### 9.3 ⛔ THE MECHANICAL PICTURE — ONE SEAM, ONE MISLEADING LABEL, FIFTEEN INHERITORS

✅ **`translateV2ToV1` has EXACTLY ONE consumer** (`kraken-websocket-adapter.ts:680`) — stated explicitly as an asserted absence with presence-evidence. It immediately does `const lastPrice = parseFloat(safeData.c[0])` — **the midpoint, renamed to `lastPrice` in one line.**

✅ **THREE `priceTick` PRODUCERS. ONLY ONE CARRIES A MID UNDER A TRADE-PRICE NAME:**

| line | producer | carries | honest? |
|---|---|---|---|
| `:700` | **`kraken_ws_ticker`** | ⛔ **the MIDPOINT** (via the translator) | ⛔ **NO — named for a ticker, carries a mid** |
| `:945` | `kraken_ws_book_mid` | an explicit midpoint | ✅ **YES** |
| `:1081` | `kraken_ws_ticker_v1` | raw v1 `ticker.c[0]`, a genuine last trade | ✅ YES |

★ **F-G-2 cited `:945` as its evidence — the HONEST one. The mislabelled producer is `:700`, and it is the one feeding the price cache.**

⚠️ **FIFTEEN live readers of `c[0]` across the server, and every one names it `currentPrice`, `lastPrice`, `lastTrade` or `marketPrice`** — including `active-execution-engine.ts:1304` (`lastTrade`) and `trading-engine.ts:610` (`marketPrice`, the LIVE order path, `#939`). ⛔ **Not all read the substituted field — the REST and v1 paths carry a genuine last trade — so the count is a SURFACE, not a defect list. Step 2 must split it.**

### 9.4 ⛔ THE GOVERNANCE FINDING — BOTH MAPS ARE SILENT ON THE SUBSTITUTION

- **`bridge/canonical/` — NO document mentions the midpoint at all.** ✅ Stated as a finding per §9.5's recording rule, not as an absence of interest: the corpus predates `b4c0d2d67` (2025-12-30), so **it documents a system in which prices are traded prices.** ⚠️ Its standing invariant — *"Price cache is the single source of truth for current prices"* (`DawnTrader_System_Invariants_Design_Guarantees.md:230`) — **is exactly what makes the substitution load-bearing: whatever enters the cache DEFINES "current price" for everything downstream.**
- **`SYSTEM_MANUAL.md:8392`** documents the CALL — *"v2 ticker updates → translateV2ToV1() → TickData events"* — **and NOT the substitution.** A reader learns the function is invoked, never that a mid replaces a last trade.
- ⛔⛔ **AND THIS UNDERSTATED IT — CORRECTED 2026-08-29 ON A RE-READ OF THE OBJECT.** Four lines up, **`SYSTEM_MANUAL.md:8388` AFFIRMATIVELY DESCRIBED the ticker channel as *"trade-based price updates"*.** ⇒ **the manual was not silent, it was WRONG**, which is a strictly worse failure: silence invites a check, an assertion ends one. ★ **I recorded "silent" because I read the node the call sits in and not the four lines above it — the audit's own §9.5(a) census question applied one hop too narrowly.**
- ⛔⛔ **`SYSTEM_IMPACT_MAP` WAS ALSO NOT SILENT, AND ITS ERROR IS THE LOAD-BEARING ONE.** §2.1 stated *"`handleV2BookUpdate` emits a book MIDPOINT and `handleV2TickerUpdate` emits a LAST-TRADE PRINT"* — **false on the ticker side, and it was the CONTRAST the entire `#741` two-field rationale was explained through.** Re-derived at the ref: both emit midpoints, differing by **feed** (ticker BBO vs depth-10 book), not by kind. ★ **THE TWO-FIELD SEPARATION SURVIVES INTACT** — different feeds carry different contamination — **but a reader who trusted that sentence would believe a transactable trade price exists on the ticker path.** ⇒ **SHARPENS THIS BATCH: no crypto producer on the LIVE path yields a genuine one-sided transactable price.**
- ✅ **BOTH DISCHARGED 2026-08-29 (§9.4 disposition 1, folded into the work in hand):** the System Manual now carries the mark-price mechanism, its 8.9.1 intent, and the eleven-week ordering at the `translateV2ToV1` node; the SIM's §2.1 sentence is corrected in place with the correction marked rather than silently rewritten.

⇒ ⛔ **This is the §9 framing rule verbatim: *buried implemented logic is a governance failure, not just a documentation miss.*** **The one line that would have prevented eight months of this is a sentence in the System Manual saying the `c` field carries a mark price, not a trade.** **Owed at Step 2 regardless of what else this batch does.**

## 10. ⛔ STEP-2 MEASUREMENT ROUND 1 (CC-C, 2026-08-29) — THE TEST IS RUNNABLE, THE HALF-SPREAD HYPOTHESIS FAILS, AND ONE CORRELATION I ALMOST REPORTED IS SPURIOUS

### 10.1 ✅ THE BASIS-GAP TEST IS **NOT** BLOCKED ON `#911` — I WAS ONE CENSUS AWAY FROM FILING THAT IT WAS

**I opened this round about to record *"unrunnable"*:** `exit_ticker_bid`/`exit_ticker_ask` are populated on **3 of 165** crypto stop-outs, which is `#911`'s known non-instrumentation. ⛔ **THAT WOULD HAVE BEEN A FALSE ABSENCE — an asserted blocker with no census behind it (rule 22).**
✅ **A schema-wide census for ANY retained bid/ask found `crypto_spot_ticker_snap` — 13,277,061 rows, 2026-07-01 → now, 687 symbols, partitioned monthly.** Joined nearest-snapshot within ±120 s of close: **117 of 165 crypto stop-outs covered (70.9%).**
⇒ ★ **THE SPREAD IS RECOVERABLE FOR THE WHOLE POPULATION. `#911` blocks the per-row witness ON THE TRADE ROW; it does not block the measurement.** *(§9.5(a): census every hop before declaring an absence. The instrument existed and was one query away.)*

### 10.2 ⛔ THE HALF-SPREAD DOES **NOT** ACCOUNT FOR THE BELOW-STOP GAP

**POST-era crypto stop-outs (n=19 with a snapshot join), medians:**

| quantity | value |
|---|---|
| shortfall vs stop — `(stop_loss − exit_price)/stop_loss` | **0.2270%** |
| half-spread at close — `((ask−bid)/2)/mid` | **0.0545%** |
| **ratio, shortfall ÷ half-spread** | ⛔ **2.23** |

⇒ **The gap is ≈ 2.2 half-spreads ≈ ONE FULL SPREAD.** ★ **So *"it is just the half-spread"* — the benign reading that would have dissolved this batch — is QUANTITATIVELY REFUTED at n=19.** ⚠️ **n=19 is thin and is stated as thin;** it is a first read, not a settled figure.

### 10.3 ⛔⛔ THE CONTROL I FIRST BUILT IS **INVALID**, AND I AM RECORDING IT BECAUSE IT READ AS DECISIVE

I compared stop exits against **target** exits — same side, same asset, so a spread cost should appear on both. **Target exits show a shortfall of EXACTLY `0.0000%`, n=103 PRE and n=14 POST.** ★ **That looked like a clean refutation of any spread-based mechanism.**
⛔ **IT IS NOT A COMPARATOR. THE TWO ARMS EXIT BY DIFFERENT MECHANISMS.** Read at the code: both branches return `price: currentPrice` (`active-execution-engine.ts:1793-1806`) — **but a target exit RESTS AS A MAKER LIMIT and closes AT THE LIMIT** (`aee:1364`, the resting-maker exit this batch's own `exit_decision_price` column exists to disambiguate). **A limit order filling at its limit is not evidence about what a market exit pays.**
⇒ ⛔ **BINDING: the exact-zero target shortfall may NOT be cited, by me or anyone, as refuting a spread mechanism.** ★ **Same family as `entry_price` being on the venue grid BY CONSTRUCTION: an arm that cannot come out the other way is not a control.**

### 10.4 ⛔ AND THE CORRELATION IS SPURIOUS — STATED BEFORE ANYONE QUOTES IT

The natural next hypothesis is **detection latency**: `exit_price` is `currentPrice`, which on the crypto path is the **BBO mid** (§9), so the shortfall is how far the mid travelled past the stop between evaluations. **Measured: `r = 0.934`** between shortfall and `exit_tick_cadence_ms`.
⛔ **THAT NUMBER IS WORTHLESS AND I AM NOT REPORTING IT AS SUPPORT.** **n = 5**, and the predictor barely moves: **cadence spans 1499–1571 ms (4.8%) while shortfall spans 0.0994%–1.2951% (13×).** ★ **A near-constant predictor cannot explain a 13-fold outcome range, whatever the coefficient says.**
✅ **WHAT THE CADENCE DATA DOES SAY, and it is the useful half: the evaluation interval is essentially CONSTANT at ~1.5 s.** ⇒ **the variance in shortfall must come from how fast price was MOVING, not from how long we waited.** That is the next test, and it needs a velocity term this scope does not yet have.

### 10.5 ⛔ THE BINDING CONSTRAINT ON THIS BATCH, MEASURED — THE EXIT-PROVENANCE COLUMNS ARE THINNER THAN §2 ASSUMED

**Crypto stop-outs, n = 165 total. Population per column:**

| column | populated | |
|---|---|---|
| `exit_price` · `actual_exit_price` · `stop_loss` | **165** | full |
| `original_stop_price` | 74 | |
| ⛔ `exit_decision_price` · `exit_book_mid` · `exit_tick_cadence_ms` · `exit_book_age_ms` | ⛔ **5** | |

⇒ ⛔ **EVERY OBJECTIVE DENOMINATED IN `exit_decision_price` HAS n = 5 ON THE STOP-OUT LEG, NOT THE 12 §2 QUOTES** (§2's 12 spans **all** close reasons, not stop-outs). **Any objective that needs the DECISION price rather than the FILL price is underpowered today and accrues at the post-deploy rate.**

### 10.6 ⛔ THE PRE-ERA IS NOT A COMPARATOR, AND I AM NOT USING IT AS ONE

PRE-boundary stop shortfall reads **0.0149%** median — *better* than its own half-spread (ratio 0.58). ⛔ **DO NOT READ THAT AS "EXECUTION USED TO BE BETTER."** Before `e6f7c70b3` (2026-08-22T22:01Z) **the book was in a crossed state 31.08% of the time**; a favourable fill measured against a corrupt book is an artifact, not a result.
★ **This is the third time in this arc that a pooled or cross-era comparison would have produced a confident wrong number. It is stated here so the next reader does not re-derive it.**

**DISPOSITION (§9.4):** all six items above are **(1) folded into the work in hand** — they are Step-2 measurement results for this batch. **No new issue is minted.** ⚠️ **`10.3`'s invalid control and `10.4`'s spurious correlation are recorded as BINDING NEGATIVES, not as findings** — their entire value is stopping a later reader citing them.

## 11. ✅⛔ STEP-2 ROUND 2 — **`BLOCKER-3` IS RESOLVED: ITS MEASUREMENT IS EXACT AND ITS CONCLUSION DOES NOT FOLLOW**

### 11.1 THE MEASUREMENT STANDS, RE-DERIVED

`original_stop_price`: **0 of 144** xStock `stop_hit`, **74 of 165** crypto. ✅ **Reproduced exactly. Langston's number is right and is not in question.**

### 11.2 ⛔ BUT "NO xSTOCK INSTRUMENT TODAY" IS FALSE — `closed_trades.stop_loss` IS POPULATED **144 of 144**

| column | xStock `stop_hit` | crypto `stop_hit` |
|---|---|---|
| `original_stop_price` | 0 / 144 | 74 / 165 |
| ✅ **`stop_loss`** | ✅ **144 / 144, all POSITIVE** | ✅ **165 / 165** |

★ **The absence was real and the conclusion drawn from it was not.** ⇒ **`OBJ-3` is NOT unsatisfiable for xStock, and does not need restating as crypto-only.**

### 11.3 THE MECHANISM, AT THE LINE — WHY ONE COLUMN IS EMPTY AND THE OTHER IS FULL

- **`closed_trades.stop_loss` is written AT OPEN from the signal:** `storage.createClosedTrade(... stopLoss: signal.stopPrice.toString() ...)` — `active-execution-engine.ts:3654`. **It is the entry-time stop and nothing rewrites it on this table.**
- **`closed_trades.original_stop_price` is read from IN-MEMORY engine state at close:** `_getTES(position.id)` → `_finalState?.originalStopPrice ?? null` (`:2215-2219`, written at `:2297`). Its own comment says it plainly — *"null on persisted trades that closed before this state was tracked."* ⇒ **a process restart empties it, which is why it is partial on crypto and absent on xStock.**
- ⛔ **AND IT IS NOT AN INDEPENDENT WITNESS.** At `:1701-1702` it is `(position as any).originalStopPrice ?? (stopLoss ?? undefined)` — **it FALLS BACK TO `stopLoss`.** ⇒ **the column that looks like a second opinion is derived from the thing it would be checked against.**

### 11.4 ⛔⛔ AND THE CONTROL FAILED TO DISCRIMINATE — WHICH IS THE MORE USEFUL RESULT

I asked whether the two columns ever differ, expecting `trailing_stop_hit` to separate them: a ratchet moves the stop **by definition**, so the "original" and the in-force stop must diverge there.

| close_reason | n (both present) | equal | differ |
|---|---|---|---|
| `stop_hit` | 74 | **74** | 0 |
| `target_hit` | 55 | **55** | 0 |
| ⛔ **`trailing_stop_hit`** | **14** | ⛔ **14** | ⛔ **0** |

⇒ ⛔ **143 of 143 IDENTICAL, INCLUDING EVERY TRAILING STOP.** ★ **So the equality does NOT license "the columns are interchangeable" — it shows the arm cannot come out the other way, exactly like `entry_price` on the venue grid (§10.3). The fallback at `:1702` is why.**

### 11.5 ➕ THE GENUINE RESIDUAL, AND IT IS A NEW FINDING RATHER THAN `BLOCKER-3`'s

⛔ **ON A `trailing_stop_hit` CLOSE, THE STOP THAT WAS ACTUALLY IN FORCE IS NOT RECOVERABLE FROM `closed_trades` AT ALL.** The ratchet writes **only** to the open-position row (`storage.updateActiveOpenPosition(... stopLoss ...)`, `:1757`) — and that row is deleted at close (the §9.5(a) census found **seven** deletion sites). Both `closed_trades` columns hold the **entry-time** stop.
⇒ **A trailing exit measured against either column is measured against a stop that was no longer in force** — it will read as a large, unexplained gap. ↔ **This is `#923`'s mechanism seen from the data side, and it is a live candidate for `OBJ-9`'s above-stop tail** (which lists *"a trailing ratchet having moved the stop"* as a candidate to eliminate, not assume).
⚠️ **BOUNDED: n=14 crypto trailing closes, and I have NOT shown this explains any specific `OBJ-9` row.** The unrecoverability is proved at the line; the attribution is not.

### 11.6 ⇒ DISPOSITION

| item | disposition (§9.4) |
|---|---|
| **`BLOCKER-3`** | ✅ **RESOLVED IN SCOPE, as Langston required — (1) folded in.** `OBJ-3` reads the xStock stop from **`closed_trades.stop_loss`**, 144/144, and is **not** restated as crypto-only. **Population excludes `trailing_stop_hit` per 11.5.** |
| **`original_stop_price` is not an independent witness** | (1) folded in — **recorded as a BINDING NEGATIVE.** It may not be cited as corroboration of `stop_loss`; it is derived from it. |
| **The trailing in-force stop is unrecoverable** | ⛔ **(2) added as an item to `B-POST-GRID-MUTATION-CENSUS`** (`PHASE_19_PLAN` row 3f.b, the investigation batch that already owns the post-VPG mutation sites) — **it is a mutation-site instrumentation gap, which is that batch's subject, not this one's.** |

## 12. ⛔⛔ STEP-2 ROUND 3 — THE xSTOCK EVIDENCE §2 NEVER HAD, AND IT **REOPENS `OBJ-9`'s UNGATING**

### 12.1 ✅ THE GAP LANGSTON NAMED IS NOW FILLED — §2 HAD **NO** xSTOCK EVIDENCE AT ALL

`xstock_spot_ticker_snap` carries bid/ask, and the join covers **144 of 144** xStock stop-outs (100%, vs 70.9% on crypto). Combined with §11's `stop_loss` at 144/144, **the xStock leg is measurable today.**

### 12.2 ⛔⛔ AND THE SIGN IS **OPPOSITE TO CRYPTO** — xSTOCK STOP-OUTS EXIT **ABOVE** THEIR STOP

**All 659 closed trades are `side = 'buy'` (verified, not assumed) — so for a long, exiting ABOVE the stop is BETTER than the stop, and a median that sits there is not a fill mechanic.**

| class | era | n | % above stop | median % above |
|---|---|---|---|---|
| crypto | PRE | 141 | 46.1% | 1.784% |
| ✅ **crypto** | **POST** | **24** | ✅ **0.0%** | — |
| xstock | PRE | 137 | 56.9% | 0.277% |
| ⛔ **xstock** | **POST** | **7** | ⛔ **85.7% (6 of 7)** | ⛔ **3.055%** |

### 12.3 ⛔ WHAT THIS DOES TO `OBJ-9` — ITS RESTATEMENT IS **CRYPTO-ONLY** AND WAS APPLIED BATCH-WIDE

✅ **`OBJ-9`'s crypto claim is CONFIRMED and STRENGTHENED.** It rested on the 74 rows carrying `original_stop_price`; re-derived on the **full 165** via `stop_loss`, **POST-epoch crypto above-stop is 0 of 24.** The crossed-book attribution (31.08% → 0 at `e6f7c70b3`) survives a wider population than it was built on.

⛔ **BUT `OBJ-9` r7 CONCLUDED — batch-wide — *"the tail is entirely pre-epoch"*, *"very likely an artifact of the crossed-book era"*, and therefore *"`OBJ-0` is NO LONGER GATED ON IT."*** ★ **THAT IS TRUE OF CRYPTO AND FALSE OF xSTOCK.** The xStock tail is **live post-epoch** and **larger** than it was before (0.277% → 3.055%).
✅ **AND THE ASYMMETRY IS EXACTLY WHAT THE MECHANISM PREDICTS, which is why it is a finding and not a puzzle:** `e6f7c70b3` fixed the **crypto book**. xStock rides `kraken_equities_ws` — **a different feed the hotfix never touched** (§2 already notes xStock's producer is *"a SOURCE, not a SIDE"* and `exit_book_mid` is NULL on all of them). **A crypto-book fix cannot extinguish an equities-feed artifact, and it did not.**

⇒ ⛔ **`OBJ-0`'s xSTOCK LEG IS STILL GATED ON `OBJ-9`. The crypto leg is correctly ungated.** ⚠️ **`OBJ-9`'s deliverable — an attribution with a `file:line`, or an explicit "unexplained" — is now OWED FOR xSTOCK SPECIFICALLY and cannot be discharged by the crossed-book citation.**
⚠️ **POWER, STATED: the POST xStock cell is n=7.** It is not a settled magnitude. **What it does establish is that the count is NOT ZERO**, and *zero* is the entire load-bearing claim the ungating rested on. ★ **A single non-zero row would have been enough; there are six.**

### 12.4 ⛔ A HYPOTHESIS I COULD NOT TEST — AND THE DEAD INSTRUMENT THAT STOPPED ME

**The candidate:** a **break-even ratchet** exit is returned as `type: 'stop_hit'` (`active-execution-engine.ts:1813-1824`, whose own comment states a BE scratch *"is indistinguishable from a real stop-out in `close_reason`"*). ⇒ **a position exiting at a ratcheted-UP stop would be recorded as a `stop_hit` sitting ABOVE its entry-time `stop_loss`** — which is precisely the shape above. **It also composes with §11.5: the in-force ratcheted stop is not recoverable from `closed_trades`.**

⛔⛔ **UNTESTABLE TODAY, AND THE ZERO IS NOT EVIDENCE.** The discriminator would be `latch_trigger_price`. **It is populated on 0 of 659 closed trades — every class, every close reason.** ★ **So `latch_fired = 0` on the above-stop rows means NOTHING; the column is dead, not negative.** ⚠️ **Same family and same cause as §11.3: it is read from in-memory engine state at close (`_finalState?.latchTriggerPrice`, `:2220`) and a restart empties it.** **THREE columns now — `original_stop_price`, `latch_trigger_price`, `rung_target_history` — all sourced from that one perishable object.**

### 12.5 ⇒ DISPOSITION

| item | disposition (§9.4) |
|---|---|
| **xStock basis-gap evidence** | ✅ **(1) folded in** — §2's stated "no xStock evidence" gap is closed |
| ⛔ **`OBJ-9` ungating is crypto-only** | ⛔ **(1) FOLDED IN — `OBJ-9` is AMENDED, not reopened as a new item.** Its crypto half stands and is strengthened; **its xStock half is owed.** `OBJ-0`'s xStock leg remains gated |
| **BE-ratchet candidate** | **(4) a scheduled review inside this batch** — it cannot be dispositioned until an instrument exists |
| ⛔ **Three perishable-state columns** | ⛔ **(2) added to `B-POST-GRID-MUTATION-CENSUS`** alongside §11.5 — one cause, one home |

⚠️ **NOT CLAIMED: that the BE ratchet explains the xStock tail.** The mechanism is cited at the line; the attribution is untested and stays untested until `latch_trigger_price` (or an equivalent) carries data.

## 13. ⛔ STEP-2 ROUND 4 — `OBJ-6`'s OWED NUMBER (AND IT WAS A DENOMINATOR ERROR), PLUS WHAT ACTUALLY DRIVES THE GAP

### 13.1 ✅ `OBJ-6` COVERAGE — THE NUMBER §8.5 Q2 REQUIRED AT STEP 2

⚠️ **PREVIOUSLY STATED (§8.5 Q2):** *"Provenance IS landing post-`ed86a758e` — but at **12 of 334** crypto and **9 of 232** xStock, **≈3.6% coverage**."*
✅ **NOW — measured per day so the ONSET is read from the data rather than assumed from a commit timestamp:**

| day | crypto stamped | xStock stamped |
|---|---|---|
| 2026-08-26 | 0 / 2 | 1 / 2 |
| 2026-08-27 | ✅ **4 / 4** | ✅ **4 / 4** |
| 2026-08-28 | ✅ **7 / 7** | ✅ **1 / 1** |
| 2026-08-29 | ✅ **2 / 2** | ✅ **3 / 3** |
| **since 08-27** | ✅ **13 / 13 = 100%** | ✅ **8 / 8 = 100%** |

⛔ **REASON FOR THE DELTA — IT IS A DENOMINATOR ERROR, NOT AN IMPROVEMENT.** The 3.6% divided by **334 and 232 lifetime closes**, the overwhelming majority of which closed **before the column existed**. ★ **A feature cannot stamp a row that closed before it shipped, so those rows are not misses — they are not in the population.**
⇒ ⛔ **THE GATE'S ANSWER CHANGES COMPLETELY. 3.6% reads as *"the instrument barely works"*; 100%-since-onset reads as *"the instrument works perfectly and we need more trades."*** ✅ **`OBJ-6` is NOT blocked on instrumentation. It is blocked on VOLUME ONLY — 21 stamped closes exist today, accruing at ~5/day across both classes.**
⚠️ **A commit timestamp was deliberately NOT used as the anchor** (`ed86a758e` is 2026-08-27T09:59Z) — **a commit time is not a deploy time**, and the 08-26 partial row is exactly the boundary a commit-anchored read would have mis-stated.

### 13.2 ★★ WHAT DRIVES THE BELOW-STOP GAP — AND IT RIGHT-SIZES THIS BATCH'S BENEFIT

§10.4 established the evaluation interval is **essentially constant (~1.5 s)**, so the variance must come from **how fast price was moving**. Tested directly — predictor = the absolute % range of the ticker mid over the **60 s before close**; population = POST-epoch crypto stop-outs.

| | |
|---|---|
| **n** | 18 |
| **r** | **0.744** |
| predictor range | **0.0000% → 1.2243%** — genuinely wide, unlike §10.4's 4.8% |
| outcome range | 0.0487% → 1.2951% |
| **median shortfall ÷ 60 s range** | **0.795** |

⚠️⚠️ **THE CAVEAT IS LOAD-BEARING AND IS STATED BEFORE THE CONCLUSION: THIS IS PARTLY TAUTOLOGICAL.** **A stop-out means price moved down through the stop by definition**, so a large 60 s range and a large shortfall both follow from *"price fell fast."* ⇒ **this is CONSISTENT WITH the movement-during-detection account; it does not ESTABLISH it, and it does not exclude the spread contributing on top.** ★ **Unlike §10.4 I am reporting this one — the predictor genuinely varies and n is 18 — but it is evidence, not proof.**

⇒ ⛔⛔ **THE CONSEQUENCE FOR THIS BATCH, AND IT MUST BE STATED BEFORE IMPLEMENTATION, NOT AFTER:**
- the gap is **≈2.2 half-spreads** (§10.2) ⇒ **the spread accounts for AT MOST ~45% of it**
- the remainder tracks **price movement during the detection interval**, which **reading the bid instead of the mid DOES NOT FIX**
★ **F-G-2's change addresses the SMALLER COMPONENT.** ✅ **THAT IS NOT AN ARGUMENT AGAINST THE BATCH — deciding on a price nobody will trade with us at is wrong on its own terms, and `OBJ-0` measures the change directly.** ⛔ **It IS an argument against promising the whole gap as the benefit**, and against any completion report that attributes a post-change improvement to side-selection without separating the movement term.

### 13.3 ⇒ DISPOSITION

| item | disposition (§9.4) |
|---|---|
| **`OBJ-6` coverage = 100% since 08-27, volume-blocked only** | ✅ **(1) folded in — §8.5 Q2's owed number is DISCHARGED**, and its 3.6% is corrected as a denominator error |
| **Movement dominates the gap** | ✅ **(1) folded in — it becomes a STATED EXPECTATION for `OBJ-0`**: the before/after read must separate the movement term or it will over-credit side-selection |
| **The tautology caveat** | **(1) folded in as a BINDING CAVEAT** — `r=0.744` may not be cited as proof of mechanism |

## 14. ⛔⛔ RIDER TO §12 — THE xSTOCK ABOVE-STOP MAGNITUDE IS `#943`, AND `OBJ-9`'s xSTOCK HALF IS THEREBY **ANSWERED**

⚠️ **§12.2 REPORTED: xStock POST-epoch above-stop = 6 of 7, median +3.055%.** ✅ **THE COUNT STANDS. THE MAGNITUDE DOES NOT — it is three rows of `#943`'s 00:15 UTC cohort.**

| symbol | closed | % vs stop | |
|---|---|---|---|
| PDD/USD | 2026-08-25 **00:15:05** | ⛔ **+5.877%** | `#943` |
| NOW/USD | 2026-08-29 **00:15:00** | ⛔ **+11.409%** | `#943` |
| TGT/USD | 2026-08-29 **00:15:01** | ⛔ **+8.624%** | `#943` |
| SNDK/USD | 08-25 14:37 | +0.116% | |
| SNAP/USD | 08-26 13:53 | +0.233% | |
| CRM/USD | 08-27 11:25 | −0.086% | |
| MRNA/USD | 08-28 12:24 | +0.070% | |

⇒ **Excluding the `#943` cohort, the remaining four sit ESSENTIALLY AT THE STOP (−0.086% to +0.233%, median ≈ +0.09%) — nothing resembling `OBJ-9`'s 2.844% tail.**

### ⇒ THIS CHANGES `OBJ-9`'s STATUS FROM *OWED* TO *ANSWERED*

⛔ **§12.3 concluded *"`OBJ-9`'s deliverable is now OWED FOR xSTOCK SPECIFICALLY."* THAT IS DISCHARGED IN THE SAME STEP, and the deliverable is exactly what `OBJ-9` asked for — an ATTRIBUTION, not a number:**
> **The large xStock above-stop exits are `#943`: the equities feed emits a bad print at 00:15 UTC and the engine closes on it. Evidenced at `out__2026-08-29_06-24-29.log` 00:15:00 — `CACHE_WRITE … NOW/USD price=118.75 source=kraken_equities_ws`, read fresh at `ageMs=1479`, against a venue book of 143.20/143.30.**

⇒ **`OBJ-0`'s xStock leg is NOT gated on an unexplained mechanism.** ✅ **It is gated on a POPULATION RULE, which is a far cheaper thing:**
⛔ **BINDING — EVERY xSTOCK POPULATION IN THIS BATCH EXCLUDES `to_char(closed_at,'HH24:MI') = '00:15'` UNTIL `#943` IS RESOLVED**, and any read that does not state the exclusion is not reportable. ⚠️ **That is ~27% of xStock stop-outs and ~29.5% of target-hits — it will materially thin the xStock leg, and the `UNDERPOWERED` rule applies to what remains.**

⚠️ **HONEST RESIDUAL, NOT PAPERED OVER: the minute-of-close is a PROXY for the defect, not the defect itself.** A genuine exit that happens to fall in that minute is excluded too, and a `#943` print landing at some other minute would be missed. **It is the best available discriminator today and it is labelled as a proxy.** ⇒ **`#943`'s batch owes a positive identifier on the row.**

★ **AND THE CRYPTO HALF OF §12 IS UNAFFECTED** — crypto has never had a 00:15 close, so `OBJ-9`'s crypto attribution (the crossed-book era) and its POST-epoch zero both stand exactly as re-derived.

## 15. ★★ STEP-2 ROUND 5 — THE CLEANEST RESULT IN THE BATCH: **THE BIAS IS CRYPTO-ONLY AND TOTAL**

**Populations, both cleaned, and the cleaning is ARGUED rather than assumed:**
- **crypto = POST-epoch only** (its PRE book was crossed 31.08% of the time — §10.6)
- **xStock = POOLED across that epoch, DELIBERATELY.** ⛔ **This is not the pooling error I made twice.** The epoch is `e6f7c70b3`, a **crypto BOOK** fix, and **xStock never reads that book** — evidenced, not assumed: `exit_book_mid` is **NULL on every xStock row**, and its producer is `kraken_equities_ws`. **A fix to an object a class does not read cannot split that class's series.**
- **both exclude `#943`'s 00:15 cohort.**

| | n | below stop | % below | median |
|---|---|---|---|---|
| ⛔ **crypto** | 24 | ⛔ **24** | ⛔ **100.0%** | **0.1657%** |
| ✅ **xStock** | 105 | 53 | ✅ **50.5%** | ✅ **0.0044%** |

★ **0.1657% reproduces the headline `0.166%` this batch was opened on, from a different column and a different population. The number that started it survives contact.**
★ **Under a null of "no side bias", 24 of 24 one-sided is p ≈ 6×10⁻⁸ (sign test). xStock's 53 of 105 is indistinguishable from a coin.**

### 15.1 ✅ AND THE "BY CONSTRUCTION" TRAP WAS CHECKED **BEFORE** THE CONCLUSION, NOT AFTER

A near-zero xStock median would be worthless if xStock exits were simply **snapped to the stop** — the §10.3 / `entry_price`-on-the-grid failure, which has now caught me twice in this batch.

| | exactly at stop | p10 | p50 | p90 | **stddev** |
|---|---|---|---|---|---|
| crypto | ✅ **0** | **+0.0604** | +0.1657 | +1.0282 | **0.3825** |
| xStock | ✅ **0** | **−0.2566** | +0.0044 | +0.4012 | ⭐ **1.3960** |

✅ **NOT SNAPPED — and the discriminator is the opposite of what a snapping artifact looks like: xStock's distribution is nearly 4× WIDER than crypto's.** It is not tight-at-zero; it is **broad and CENTRED on zero**. ⇒ **the contrast is real.**

### 15.2 ⛔⛔ THIS KILLS "IT IS JUST PRICE MOVEMENT" AS AN EXPLANATION **OF THE SIDEDNESS**

§13.2 found the crypto gap tracks recent price movement, and warned the correlation was partly tautological. **Round 5 settles the part that matters.**
⇒ ★ **BOTH CLASSES STOP OUT ON A FALLING PRICE. If detection-lag overshoot were the whole story, xStock would be biased below its stop TOO. It is not — it is symmetric.**
⇒ ⛔ **So the crypto one-sidedness needs a CLASS-SPECIFIC cause, and the midpoint substitution is exactly that: it is on the crypto path only** (§9 — `c[0]` carries the BBO mid via `translateV2ToV1`; xStock's producer is *a SOURCE, not a SIDE*). ★ **A tight distribution with a floor at ~one half-spread (`p10 = +0.0604%` against a median half-spread of `0.0545%`) is the signature of a SYSTEMATIC OFFSET, not of noise.**
⚠️ **STILL NOT PROVEN, AND THE GAP IS NAMED: this establishes a class-specific systematic offset whose size and floor are consistent with the mid/bid mechanism. It does not exhibit the mechanism end-to-end — `OBJ-0`'s before/after arm is what does that.** ★ **Movement and the offset COMPOSE: movement sets the magnitude's variance (§13.2), the offset sets its SIGN and its floor.**

### 15.3 ⇒ WHAT IT DOES TO THE BATCH

| | |
|---|---|
| ✅ **The crypto thesis** | **STRENGTHENED on an independent population** — a different column, a different denominator, and a control that could have refuted it |
| ⛔ **`OBJ-3` — "BOTH ASSET CLASSES"** | ⛔ **NEEDS A SCOPE DECISION. xStock shows NO side bias at n=105.** Applying the same change there would be a fix to a class with no measured defect. ⇒ **`OBJ-3`'s xStock arm should become *verify the absence holds*, not *make the same change*** — stated for Langston, **not decided unilaterally** |
| ✅ **§13.2's right-sizing** | **UNCHANGED and now better founded** — the spread is a MINORITY of the magnitude, and it is the whole of the SIGN |

**DISPOSITION (§9.4): (1) folded into the work in hand.** ⛔ **`OBJ-3`'s narrowing is a RECOMMENDATION TO LANGSTON at Step 4, not an edit I make to the objective.**

## 16. LANGSTON'S THREE PRE-REGISTERED CONDITIONS ON THE `OBJ-3` NARROWING - MEASURED

> **His ruling (2026-08-29): NARROWING GRANTED CONDITIONAL. Criteria fixed BEFORE I looked: (a) shifted-series power >=80% - (b) both epoch halves coin-like at 0.05 - (c) the symmetry conclusion invariant to the `#943` exclusion. Any failure => `OBJ-3` stands as approved, both classes.**
> **AND HE STRUCK MY HEADLINE:** *"Your statistics are not the strongest argument and I want you to stop leading with them."* **He is right, and section 15 led with `24/24` and `p ~ 6e-8`.**

### 16.0 THE ARGUMENT THAT ACTUALLY CARRIES THE ARM - MECHANISTIC, WITH THE LINE (his 29(c))

| path | the price the exit decision reads |
|---|---|
| **crypto** | `kraken-websocket-adapter.ts:680` -> `translateV2ToV1(update)` -> `c[0]`, and `kraken-v2-translator.ts:53-58` sets that to **`(bid + ask) / 2`** whenever both sides exist |
| **xStock** | **`active-execution-engine.ts:1230` - `currentPrice = _eqTick.price;`** - a **SCALAR**. **There is no bid/ask pair on this leg to take a midpoint of.** The code says so itself at `:1232`: *"there is no adapter quote object on this leg."* |

=> **THE SUBSTITUTION HAS NO xSTOCK ANALOGUE BY CONSTRUCTION. Replacing "the mid" with "the bid" is not unnecessary on xStock - it is UNDEFINED there, because there is no mid.** **This discharges the arm without a single p-value. The statistics CORROBORATE; they do not decide.**

### 16.1 CONDITION (3) - THE NUMBER HE SAID WAS MISSING, AND IT RUNS THE **OPPOSITE** WAY

**His worry:** *"If it runs strongly one-sided, the exclusion manufactured the symmetry."* **It IS strongly one-sided - and in the direction that makes the worry not apply.**

| series | n | below stop | % | exact two-sided p |
|---|---|---|---|---|
| **the EXCLUDED `#943` cohort** | 39 | **7** | **17.9%** | **7.0e-05** |
| xStock, exclusion **ON** | 105 | 53 | **50.5%** | 1.00 |
| xStock, exclusion **OFF** | 144 | 60 | **41.7%** | **0.0549** |

=> **The cohort is strongly ABOVE stop. Excluding it removed ABOVE-stop rows, so the exclusion moved xStock TOWARD 50%, not away from crypto's below-stop bias.** => **it cannot have manufactured a false absence of a BELOW-stop bias.**
**(c) HOLDS - but MARGINALLY, and I am not rounding that away: with the exclusion OFF, `p = 0.0549` against a 0.05 threshold.** **What is robust is the thing actually at issue: BOTH readings are <=50.5% below, against crypto's 100%. Any residual xStock lean is OPPOSITE in direction to crypto's.**

### 16.2 CONDITION (a) - POWER, DISTRIBUTION-FREE, AND IT SETTLES HIS DISPERSION OBJECTION

His point: robust sigma from my own p10/p90 is **0.257** while the stddev is **1.396**, implying power of **>99%** or **~16%** - *"the absence is either decisive or vacuous."*
**Run as he specified - add crypto's `+0.1657` to each observed xStock deviation, recount, sign test. No distributional assumption.**
- **shifted below-stop rate `p1 = 90/105 = 0.8571`**
- rejection region `k <= 41` or `k >= 64` (n=105, alpha=0.05 two-sided)
- **POWER = 100.0% - PASS.**
=> **The stddev of 1.396 is outlier-inflated; the DENSITY NEAR ZERO is tight, which is what a sign test keys on. The absence is decisive, not vacuous.**

### 16.3 CONDITION (b) - BOTH HALVES COIN-LIKE, AND ONE OF THEM IS UNINFORMATIVE

| half | n | below | % | p |
|---|---|---|---|---|
| **PRE** | **101** | 52 | 51.5% | 0.842 |
| **POST** | **4** | 1 | 25.0% | 0.625 |

**PRE passes on real power.** **POST passes the LETTER and is EVIDENCE OF NOTHING - a sign test at n=4 cannot reject any hypothesis, so its "coin-like" is the instrument being silent, not the series being symmetric (`#661` leg 3).** **I am reporting it as a pass-by-vacuity rather than banking it, because condition (b) was written to replace my pooling argument with measurement - and at n=4 there is no measurement.**
=> **The pooling he told me not to argue is now unnecessary for PRE and unresolved for POST.** **His `#675` point stands: `exit_book_mid` NULL is evidence about what xStock POPULATES, not about what the epoch TOUCHED. I am not re-arguing it.**

### 16.4 NEW, AND IT ANSWERS HIS *"one-day-old minute-of-close proxy is load-bearing"* DIRECTLY

**The `#943` exclusion is no longer only a time proxy - it has an independent PHYSICAL signature.** Spread at close, from the equities ticker snapshots:

| cohort | n | median spread | p90 | over 1% |
|---|---|---|---|---|
| **00:15** | 65 | **8.2192%** | **39.15%** | **49 of 65** |
| all other xStock | 167 | **0.1665%** | 1.59% | 21 |

=> **~49x wider at the median.** **That is the signature of a SHUT MARKET, and `00:15` UTC is `20:15` ET - minutes after US extended hours end.**
**AND IT CONVERGES WITH LANGSTON'S OWN INDEPENDENT TRIAGE THE SAME DAY** (the `Exit checks skipped` alerts): *"the price we're carrying for these two isn't a price anyone traded at... with the market shut..."* - **he found it on the WEEKEND boundary from the alert side; `#943` is the DAILY boundary from the trade side. Same root, two instruments, neither derived from the other.**
=> **The cohort is a physically distinct population, not a cherry-pick.** **The proxy is still a proxy - `#943` still owes a positive row-level identifier - but it is now corroborated rather than asserted.**

### 16.5 => AGAINST HIS CRITERIA

| criterion | result |
|---|---|
| **(a) shifted-series power >=80%** | **PASS - 100.0%** |
| **(b) both epoch halves coin-like at 0.05** | **PASS ON THE LETTER.** PRE genuine (n=101, p=0.842); **POST vacuous (n=4)** |
| **(c) invariant to the `#943` exclusion** | **PASS, MARGINALLY** - exclusion-off `p=0.0549`; **and the excluded cohort is one-sided in the OPPOSITE direction, so it cannot have manufactured the absence** |

**I HAVE NOT EDITED `OBJ-3`.** Two of three pass with a caveat I am not smoothing over, and **his instruction was explicit: do not edit the objective yet.** => **returned to him for confirmation.**
**If confirmed, the narrowed arm ships as he specified: a FENCE WITH A DERIVED SUBJECT** (F-G-1 precedent - never a name list) **asserting no xStock exit path reads a book mid, so a future mid-based path fails CI instead of passing silently.**

## 17. RETRACTED - LANGSTON FAILED THE NARROWING, AND SECTION 16.0 IS WRONG. `OBJ-3` STANDS AS APPROVED, BOTH CLASSES.

### 17.1 THE RETRACTION, RE-DERIVED BY ME AT THE REF RATHER THAN ACCEPTED ON REPORT

**Section 16.0 claimed the mid-for-bid substitution is UNDEFINED on xStock because `active-execution-engine.ts:1230` reads a scalar. THAT IS FALSE.** Verified at `origin/migration/aws-supabase`, `equity-spot-archiver.ts:130-137`:

```
const _mark = (_bid > 0 && _ask > 0) ? (_bid + _ask) / 2 : _last;
if (Number.isFinite(_mark) && _mark > 0) latestEquityTick.set(..., { price: _mark, tsMs: Date.now() });
```

**Its own comment at `:129` says it in words: *"P19-B8.5 xstock marks: mid from bid/ask when both sides exist, else last."*** Writer census, tree-wide, tests excluded: **exactly ONE `.set` site** (`:137`), and `getLatestEquityTick` (`:115`) returns that object to `:1230`.
=> **`_eqTick.price` IS A MIDPOINT** - three-state with a `_last` fallback, **structurally identical to crypto's `c`**. The substitution is not absent on xStock; **it is ONE HOP UPSTREAM of the line I measured.**

### 17.2 THE FAILURE IS `wrong-object`, AND IT CONTRADICTED MY OWN r1 SCOPE

**`B_EXIT_TRANSACTABLE_SIDE_SCOPE.md:37` at `cdb783a8d`, written by me, says:**
> *"`getLatestEquityTick` <- `equity-spot-archiver.ts:135` **`(bid + ask) / 2`** - **YES, a different route to the same defect**"*

and directly beneath it, the line the whole batch was framed on:
> *"**A CRYPTO-ONLY F-G FIXES HALF THE PROBLEM AND WOULD READ AS COMPLETE.**"*

**I argued for exactly the crypto-only narrowing my own scope was written to prevent.** Two distinct errors, and neither is the statistics:
1. **I TRACED TO THE CONSUMER AND STOPPED.** `currentPrice = _eqTick.price` is a scalar AT THAT LINE, and I generalised "scalar" into "no mid exists on this lane" without one hop upstream. **Langston's `#675` shape: a true absence measured on the adjacent object, then generalised onto the lane.**
2. **I MISREAD A COMMENT AS EVIDENCE ABOUT A DIFFERENT THING.** The `:1232` note (*"no adapter quote object on this leg"*) is `B-EXIT-PROVENANCE` R6-3 about where the provenance STAMP originates - **object shape at the consumer**, not **semantics of the number**. Bid and ask plainly exist on that leg: they are in the same payload, buffered to `xstock_spot_ticker_snap` - **which is exactly why `exit_ticker_bid` adjudicated EXACT on 6 of 6 in the `#940` rider.** My own evidence, two sections earlier, refuted my own claim.

**MISTAKE: wrong-object [F-G-2] - measured at the consumer, generalised about the producer, and contradicted a finding I had written myself.**

### 17.3 THE STATISTICS, RE-RUN UNDER HIS CORRECTED SPECIFICATION

**He withdrew his own power spec as wrong:** he set the shift at crypto's absolute `+0.1657%`, but the mechanism predicts **xStock's OWN half-spread** - `0.1665% / 2 = 0.0833%` from section 16.4.

| shift | p1 | power |
|---|---|---|
| +0.1657 (his original spec) | 90/105 = 0.857 | 100.0% |
| **+0.0833 (corrected - xStock's own half-spread)** | **84/105 = 0.800** | **100.0%** |

**(a) passes under BOTH specifications.** **It does not rescue the narrowing** - with the mechanism refuted, (b) failing on substance (n=4 is no measurement) and (c) marginal at 0.0549, there is nothing to stack them on.
**BUT IT SHARPENS WHAT REMAINS, and this is the useful residue: at n=105 we had 100% power to detect an offset the size of xStock's own half-spread, AND WE DID NOT DETECT ONE.**

### 17.4 => THE REAL OPEN QUESTION, WHICH IS BETTER THAN THE ONE I ASKED

**THE MECHANISM IS ON BOTH CLASSES. THE SIDEDNESS IS NOT.** crypto 24/24 below; xStock 53/105. **That is an ANOMALY TO EXPLAIN, not a licence to cut** - and 17.3 rules out "we could not have seen it."

**Candidates, to ELIMINATE and not to assume (his list, and it is the deliverable):**
1. **the `_last` fallback arm firing often on thin names** - when a side is missing the mark is a genuine last trade, so those rows carry no mid at all
2. **residual `#943` contamination outside the 00:15 minute** - the proxy is minute-of-close and the defect is a shut-market quote; those are not the same set
3. **a ~0.08% offset genuinely buried** - though 17.3 argues against it

**DISPOSITION (section 9.4): (1) FOLD INTO THE WORK IN HAND.** `OBJ-3` stands as approved, both asset classes, unamended.

### 17.5 TWO THINGS HE CORRECTED THAT WOULD HAVE SHIPPED

- **THE FENCE WORDING WAS WRONG AND WOULD HAVE PASSED BY VOCABULARY.** I drafted *"no xStock exit path reads a **book** mid."* **xStock's mid is a TICKER mid, off `data.bid`/`data.ask` - never the book.** That fence goes green while the live defect sails under it. **Any fence here asserts the TICKER mid, with a derived subject.**
- **`BLOCKER-3` IS NOT DISCHARGED BY SECTION 11.** He holds that `OBJ-3`'s xStock arm still needs a stop reference wired **as its own prerequisite, in scope, not at Step 8.** Section 11 established `stop_loss` is populated 144/144 and usable for MEASUREMENT; it did not wire an instrument for the objective.

### 17.6 WHAT HE ACCEPTED

**`#943` - accepted, and he called it the strongest thing in the round.** The 49x median spread at 00:15 against every other close is a physical signature arrived at independently of his own alert triage, and it corroborates the minute-of-close proxy properly. **It still owes the positive row-level identifier.**

## 18. THE ANOMALY - TWO CANDIDATES ELIMINATED WITH NUMBERS, AND A FIFTH THAT MAY DISSOLVE THE COMPARISON

**The question (Langston's framing, and it is better than the one I asked): the midpoint mechanism is on BOTH classes; the sidedness is on ONE. crypto 24/24 below stop; xStock 53/105.**

**RETENTION FLOOR, STATED BEFORE ANY ZERO IS READ (his condition 2):** `xstock_spot_ticker_snap` holds **2026-07-01 -> 2026-08-29, 59.5 days** - it spans the whole stop-out population, so retention does not bound anything below.
**PREDICATE, PER HIS CONDITION 1:** measured on **POSITIVE** (`bid > 0 AND ask > 0`), never on null. A `0` or negative quote is stored non-null and still takes `_last`; a null-based predicate would under-count the fallback and manufacture the very absence being tested.

### 18.1 THE THREE STATES OF `parseTickerSnap`, MEASURED - 7 days, 14,565,408 snaps

| state | condition | snaps | share |
|---|---|---|---|
| **1 mid** | `bid>0 AND ask>0` -> `_mark=(bid+ask)/2`, written | **14,565,406** | **100.000%** |
| **2 `_last` arm** | else `last>0` -> `_mark=last`, written | **2** | 0.000% |
| **3 `#636` no-write** | else -> **nothing written, previous mark CARRIED** | **0** | 0.000% |

**CANDIDATE 1 (my `_last` fallback) - ELIMINATED.** 2 snaps in 14.5 million. It dilutes nothing.
**CANDIDATE 4 (his `#636` carried mark) - NOT OBSERVED**, and it was the better candidate because it predicts **attenuation** rather than sidedness, which is the shape that would reconcile "full power for an offset that size" with "did not see one."
**INSTRUMENT REACH, STATED: a payload with no `symbol` returns at `:121` before BOTH the stamp and the buffer, so it writes no snap row and is INVISIBLE to this instrument.** The count covers snaps that reached `bufferTickerSnap`. **The `#636` zero is bounded by that, and by the 7-day window** - the full-history query exceeded the statement timeout and is not reported as a result.
**Structural note (his, and stronger than my grep): `latestEquityTick` is a module-private `const` at `:112`, never exported, and `:137` is the only `.set`. No caller can defeat it.**

### 18.2 => THE ANOMALY IS NOW HARDER, NOT EASIER

**xStock marks are midpoints essentially 100% of the time.** Both attenuation candidates are dead. So the two classes take the same mechanism and produce opposite sidedness, and nothing measured so far explains it.

### 18.3 CANDIDATE 5, MINE - AND IT WOULD NOT EXPLAIN THE ANOMALY, IT WOULD DISSOLVE THE COMPARISON

**The exit trigger is SHARED.** `active-execution-engine.ts:1793-1806` returns `price: currentPrice` for both `target_hit` and `stop_hit`, and the xStock branch *"falls through into the shared evaluation pipeline"* (`:1243`). **So a `stop_hit` fires when the mark crosses the stop, and the recorded `exit_price` IS that mark.**
=> **An `exit_price` ABOVE its `stop_loss` should therefore be IMPOSSIBLE. 53 of 105 xStock rows are above it.**

**The mechanism that makes it possible is already on this file at section 11.5: the RATCHETED stop is not recoverable from `closed_trades`.** The ratchet writes only to the open-position row (`:1757`), that row is deleted at close, and **both** `closed_trades` stop columns keep the **entry-time** stop. A break-even ratchet exit is returned as `type: 'stop_hit'` (`:1813-1824`, its own comment: *"indistinguishable from a real stop-out"*).
=> **A ratcheted-up stop that is hit produces a genuine `stop_hit` whose `exit_price` sits ABOVE the entry-time `stop_loss` I am measuring against.**

**IF xStock ratchets materially more often than crypto - longer holds, different volatility - then the xStock "symmetry" is not an absence of bias. It is a DIFFERENT STOP being used as the yardstick on half the rows,** and the crypto/xStock comparison in sections 15-17 is confounded rather than informative.

**NOT CLAIMED, AND THE INSTRUMENT FOR IT DOES NOT EXIST TODAY.** `latch_trigger_price` is populated on **0 of 659** closed trades (section 12.4) and `original_stop_price` is absent on all 144 xStock rows (section 11) - **both fed from the same perishable in-memory state.** So the ratchet rate per class is **not measurable from `closed_trades` at all**, and I am recording a candidate, not a finding.
=> **This is the first thing that makes `BLOCKER-3` load-bearing rather than procedural: Langston kept it open on the ground that "a usable field is not a wired instrument," and candidate 5 is the question that needs the wired one.**

**DISPOSITION (section 9.4): (1) fold into the work in hand.** Candidates 1 and 4 closed with numbers; **2 (residual `#943` outside 00:15) and 3 (a buried offset) remain open**; **5 is new and, if true, retires the comparison rather than explaining it.**

### 18.4 ONE THING I MEASURED THAT DOES NOT ANSWER WHAT I POINTED IT AT

I hypothesised **coarse xStock detection** - if xStock updated far less often, the mark at a valid check would be a draw either side of the stop, giving symmetric wide scatter. **Measured, 7 days:** xStock median inter-snap gap **4.61 s**; crypto **20.05 s**.
**REFUTED FOR xSTOCK - 4.61 s is not coarse.** **AND THE CRYPTO NUMBER IS A WRONG-OBJECT READ THAT I AM NOT USING:** for xStock the archive and the mark are written in the **same call**, so the snap gap IS the mark cadence; for crypto the archive is a **different path** from the engine's price cache, whose measured evaluation cadence is **~1,500 ms** (section 10.4). **The two columns are not the same quantity and must not be compared** - stated because the table above puts them side by side and invites exactly that.

## 19. CANDIDATE 2 NOT SUPPORTED, MY SPREAD-IDENTIFIER FAILS - AND THE ANOMALY SURVIVES A MATCHED-SPREAD COMPARISON

**The test:** `#943`'s physical signature is a WIDE spread (shut market). If wide-spread rows exist OUTSIDE the 00:15 minute and behave like the cohort, then candidate 2 is real **and** spread becomes the positive row identifier `#943` owes, replacing the time proxy. **xStock `stop_hit`, all 144, split three ways:**

| group | n | below stop | % | median deviation | median spread |
|---|---|---|---|---|---|
| **A** 00:15 cohort | 39 | 7 | **17.9%** | **-2.8149%** (ABOVE stop) | 4.20% |
| **B** wide spread, NOT 00:15 | 15 | 9 | **60.0%** | **+0.4223%** (BELOW stop) | **8.77%** |
| **C** normal spread, not 00:15 | 90 | 44 | **48.9%** | **-0.0011%** (AT the stop) | 0.157% |

### 19.1 BOTH THINGS I WAS TESTING FOR COME BACK NEGATIVE

**CANDIDATE 2 - NOT SUPPORTED.** Group B is not a leak of the same defect: it skews **BELOW** the stop while the 00:15 cohort skews **ABOVE**, and its spreads are **wider** than the cohort's (8.77% vs 4.20%). **Opposite direction on a wider signature is not the same phenomenon.**
**AND MY PROPOSED IDENTIFIER FAILS WITH IT.** I expected spread to replace the minute-of-close proxy as `#943`'s positive identifier. **It cannot: wide spread outside 00:15 produces the opposite behaviour.** => **`#943` still owes a positive row identifier, and it is NOT the spread.** *(Recorded because the proposal was mine and it would otherwise look untried.)*

### 19.2 THE RESULT THAT MATTERS - THE ANOMALY SURVIVES ON MATCHED SPREAD REGIMES

**The obvious remaining explanation for the class difference was that xStock's quotes are simply wider, so its exits scatter. Group C settles it.**

| | n | median spread | below stop |
|---|---|---|---|
| **crypto, POST-epoch** | 24 | **~0.109%** (from the 0.0545% median half-spread) | **24 = 100%** |
| **xStock group C** | 90 | **0.157%** | **44 = 48.9%** |

=> **COMPARABLE SPREAD REGIMES, OPPOSITE SIDEDNESS.** Crypto is 100% one-sided at a tight spread; xStock at a similarly tight spread sits **dead on its stop** (median -0.0011%). **"xStock spreads are wider" is eliminated as the explanation**, and the anomaly is now stated on the cleanest population either class has.

### 19.3 AN OBSERVATION I AM NOT PROMOTING TO A FINDING

**Group B - 15 xStock stop-outs, median spread 8.77%, 60% below stop, median +0.4223%.** That is the crypto-like direction appearing on xStock's widest-spread rows. **n=15, and I have not tested it against anything.** **NOT a finding, NOT dispositioned as one** - recorded so it is not re-discovered as novel, and because if it survives it would be the first xStock evidence pointing the same way as crypto.

**DISPOSITION (section 9.4): (1) fold into the work in hand.** Candidate 2 closed as not-supported; the spread-identifier proposal withdrawn with its measurement; **candidates 3 and 5 remain open, and 5 remains untestable until `BLOCKER-3` wires an instrument.**

## 20. CANDIDATE 5 REFUTED WITH EXISTING DATA - AND I TESTED MY OWN HEADLINE FOR INDEPENDENCE

### 20.1 CANDIDATE 5 IS DEAD, AND IT DID NOT NEED THE INSTRUMENT I SAID IT NEEDED

Section 18.3 said candidate 5 was untestable because `latch_trigger_price` is empty. **That was true of the DIRECT test and false of the question.** A break-even ratchet moves the stop UP to about the entry price - **so a BE-ratcheted stop-out must exit at ~entry.** That is testable from columns that are fully populated.

**xStock `stop_hit`, `#943` cohort and wide-spread rows excluded, n=90:**

| | n | p10 vs entry | median vs entry | p90 vs entry | within 0.25% of entry |
|---|---|---|---|---|---|
| **exits ABOVE its stop** | 46 | -4.922% | **-2.749%** | -1.749% | **1 of 46** |
| exits BELOW its stop | 44 | -3.800% | **-2.821%** | -1.361% | 1 of 44 |

=> **REFUTED. Rows that exit ABOVE their recorded stop are still ~2.7% BELOW their entry price** - they are ordinary losing stop-outs, not stops that had been ratcheted up to break-even. **One row in 46 sits near entry.**
=> **And the two groups are INDISTINGUISHABLE relative to entry (-2.749% vs -2.821%).** They are the same kind of trade; the only difference is which side of the *recorded* stop they landed on. **The xStock symmetry is not a ratchet artifact, and the comparison in sections 15-19 is not confounded by one.**

**METHOD NOTE ON MYSELF: I declared this untestable one section ago because I reached for the direct instrument and stopped when it was empty.** The question was answerable from `entry_price`, which is populated on all 144. **Same shape as section 10.1, where I nearly filed the basis-gap test as blocked on `#911` while 13.3M usable rows sat one census away.** => **BEFORE RECORDING SOMETHING AS UNTESTABLE, ASK WHAT ELSE WOULD HAVE TO BE TRUE.**

### 20.2 AND I PUT MY OWN HEADLINE THROUGH THE CHECK I HAD ONLY APPLIED TO xSTOCK

`24/24` at `p ~ 6e-8` **assumes independent draws.** If those 24 crypto stop-outs were a handful of symbols in a short window, the effective n is far smaller and I have been over-quoting my own strongest number.

**Measured: 24 stop-outs across 20 DISTINCT SYMBOLS, 6 DAYS and 21 DISTINCT HOURS** (2026-08-23 04:45Z -> 2026-08-28 16:10Z). Most-repeated symbol is `TRUMP/USD` at 3; then `AAVE/EUR` and `ZEC/USD` at 2.
=> **Well spread, not clustered.** **Conservatively collapsing to one draw per symbol still gives 20 one-sided draws, `p ~ 1.9e-6`.** **The headline survives, and it survives a test I ran against myself rather than against the side I wanted to cut.**

### 20.3 => WHERE THE ANOMALY NOW STANDS

**ELIMINATED WITH NUMBERS:** the `_last` fallback arm (2 of 14.5M) - the `#636` carried mark (0) - residual `#943` contamination outside 00:15 (opposite direction) - **spread regime** (matched at ~0.11% vs 0.157%, opposite sidedness) - **detection cadence** (xStock 4.61s) - **the BE-ratchet artifact** (exits sit 2.7% below entry).
**STILL OPEN:** candidate 3, a genuinely buried small offset - **against which section 16.2 measured 100% power at xStock's own half-spread.**

=> ⛔ **THE HONEST STATE: THE MIDPOINT MECHANISM IS ON BOTH CLASSES, THE SIDEDNESS IS ON ONE, AND SIX EXPLANATIONS ARE DEAD.** ★ **That is a better-framed question than the one Langston handed me, and it is NOT a licence to narrow `OBJ-3` - it is the reason `OBJ-3` must stay as approved: the xStock arm is what would settle it.**

**DISPOSITION (section 9.4): (1) fold into the work in hand.**

## 21. THE CLASS-SPECIFIC DIFFERENCE, MEASURED - AND IT IS AN ORDER OF MAGNITUDE LARGER THAN THIS BATCH'S PREMISE

**The anomaly asked what is different about crypto. This is it, and it is not a half-spread.**

### 21.1 CRYPTO'S EXIT PRICE SITS BELOW THE VENUE'S OWN PUBLISHED QUOTE. xSTOCK'S SITS ON IT.

Each exit joined to its own class's ticker snapshot - **the venue's published BBO** - nearest within 60s:

| | n | median join offset | `exit_price` vs snapshot MID | vs snapshot BID | below mid |
|---|---|---|---|---|---|
| **crypto** POST-epoch | 18 | **1.7 s** | **-0.4229%** | **-0.3029%** | **16 of 18** |
| **xStock** (`#943` excluded) | 105 | **1.1 s** | **+0.0054%** | +0.0631% | 49 of 105 |

**JOIN-DISTANCE CONTROL, because stop-outs happen on FALLING prices and a distant snapshot would manufacture exactly this:** the offsets are comparable (1.7s vs 1.1s), and **tightening to <=5s (17 of 18 crypto rows) moves the crypto figure to -0.4798% - the gap GROWS, it does not wash out.** xStock tightens to +0.0058%.

=> **xStock's recorded exit price IS the venue mid. Crypto's is ~0.48% BELOW it - and ~0.30% below the venue BID, i.e. below anything transactable.**

### 21.2 IT IS NOT THE FILL WALK

`exit_slippage` is populated on all 24 crypto POST rows: **median 0.0659% of notional.** => **the depth walk accounts for roughly an eighth of the 0.48% gap.** The rest is present *before* the fill.

### 21.3 AND THE DECISION PRICE ITSELF IS ALREADY BELOW THE VENUE MID (n=3 - THIN, AND SAID SO)

The only three crypto stop-outs carrying `exit_decision_price`:

| symbol | decision vs venue mid | fill vs venue mid |
|---|---|---|
| SPX/USD | **-0.2658%** | -0.6894% |
| CHIP/USD | **-0.3220%** | -0.5797% |
| DOG/USD | **-1.2243%** | -2.2907% |

=> **The DECISION is already below the venue's published mid, before any fill.** **n=3, one of them a sub-penny asset where tick effects are large. This is a LEAD, not a result** - it accrues at the post-deploy rate (section 13.1).

### 21.4 WHAT THIS DOES TO THE BATCH'S PREMISE - AND IT IS THE REASON TO SAY IT AT STEP 2

**This batch is premised on: the exit decision reads a MIDPOINT while a sell fills on the BID. That is a HALF-SPREAD story, and crypto's median half-spread is 0.0545%.**
**Measured, the crypto exit price sits 0.48% from the venue's own quote - roughly NINE TIMES the half-spread, and on the wrong side of the bid.**

=> ★ **A DIFFERENT AND LARGER MECHANISM IS PRESENT.** The r1 scope already names the likely route: the crypto active path reads `livePricingAdapter.getPriceWithFallback` <- the adapter cache <- **`handleV2BookUpdate`'s DEPTH-10 BOOK midpoint**, whereas `crypto_spot_ticker_snap` carries the **TICKER BBO**. **Two different feeds from the same venue, disagreeing by ~0.48% at exit time.**

⛔ **WHAT IS NOT ESTABLISHED, AND I AM NOT ASSERTING IT:**
1. **That the book/BBO divergence CAUSES the one-sided below-stop pattern.** It is consistent with it and it is class-specific, which is what the anomaly needed - **but the decision-side evidence is n=3.**
2. **That the book mid is WRONG.** A depth-10 mid and a BBO mid are different statistics; on a thin book they legitimately differ. **Which one the exit decision SHOULD use is a design question, not a defect finding.**
3. **That this survives the `#741` history.** The book feed is the one with the crossed-state defect; POST-epoch it is clean - **but "clean" was established against crossed states, not against BBO agreement.**

=> ⛔ **THIS IS NOT A LICENCE TO WIDEN THE BATCH.** It is stated at Step 2 because **F-G-2 as scoped would fix the 0.055% half-spread and leave a ~0.48% divergence in place, and the completion report would read as though the exit price had been made transactable.** **That is the `#941` failure shape - a document that reads as complete over a mechanism nobody measured.**

**DISPOSITION (section 9.4): (1) FOLD INTO THE WORK IN HAND as a Step-2 finding, and DISPATCHED TO LANGSTON as its own gate** - whether `OBJ-0`'s before/after arm must measure against the venue BBO rather than against our own prior price, and whether the book/BBO divergence is its own batch. **Not decided here.**

## 22. LANGSTON'S RULING ON SECTION 21 - HE REFUTED MY OWN HEDGE, AND IT IS WORSE THAN I FRAMED IT

### 22.1 MY "NOT ASSERTED" ITEM 2 IS REFUTED - ONE STATISTIC COMPUTED TWO WAYS

I hedged that a depth-10 mid and a BBO mid are different statistics that may legitimately differ on a thin book - a design question, not a defect. **He re-read the adapter at `a6be11883` and that is wrong:**
- `kraken-websocket-adapter.ts:910-911` - `bestBid = Math.max(...book.bids.keys())`, `bestAsk = Math.min(...book.asks.keys())`
- `:917` comment - *"8.9.4-Patch: Calculate stable midpoint from mini-book BBO"* - `:918` `midpoint = (bestBid+bestAsk)/2`, emitted `:945` as `kraken_ws_book_mid`

=> **"DEPTH-10" DESCRIBES THE SUBSCRIPTION, NOT THE STATISTIC. It is a TOP-OF-BOOK mid.** So this is **ONE quantity constructed two ways** - ours from a locally delta-maintained book, the venue's published - **and two constructions of the same quantity disagreeing by 0.48% is not a design question. It is a BOOK-STATE ERROR, `#507`/`#741` family.**
**His direction candidate, carried as HYPOTHESIS ONLY: an orphaned ask below the true best ask drags `Math.min(asks)` down - `#507` on the mirror side. NOT MEASURED.**

### 22.2 THE SEQUENCING IS WORSE THAN MY FRAMING

I wrote that F-G-2 as scoped leaves the divergence standing beside the fix. **He is sharper: `OBJ-1` SOURCES CRYPTO'S BID FROM THAT SAME MINI-BOOK.**
=> **F-G-2 does not leave it beside the fix - IT ROUTES THE NEW DECISION PRICE THROUGH THE OBJECT UNDER SUSPICION.**

### 22.3 HIS TWO ANSWERS

**Q1 - DO NOT RE-BASE `OBJ-0`. NO.** The 2x2 is **rule-vs-rule** and stays internally valid on a biased series **because both arms read the same one**; re-basing folds two fixes into one unseparable number. => **ADD A THIRD READ-OUT - decision price vs contemporaneous venue BBO, PER ARM, reported separately, NEVER netted into the 2x2.**

**Q2 - OWN BATCH, and its MEASUREMENT leg is a PREREQUISITE of F-G-2 implementation, not a successor.** The measurement, not the fix. **My own section 1 argument turned on me: you cannot pre-register a rule-vs-rule before/after while the series both arms read is moving under you.** `HOME: B-BOOK-BBO-DIVERGENCE, owner CC-C, PHASE_19_PLAN 3b.c, before F-G-2 implementation, after the F-G-1 soak.` Fix leg may sit in Phase 20 with `#507`.

### 22.4 TWO DEFECTS HE FOUND IN MY MEASUREMENT - BOTH CORRECTED

**(1) MY 5-SECOND JOIN CONTROL IS WITHDRAWN. It moved 17 of 18 rows, so it discriminated almost nothing** - and I presented it as the thing that ruled out the timing confound. **Struck. Section 21's join argument now rests only on the comparable median offsets (1.7s vs 1.1s), which is weaker than I stated it.**

**(2) THE 6 NON-JOINING ROWS, EXPLAINED - a POPULATION BOUNDARY, not random dropout:**

| symbol | snaps in window | snaps EVER |
|---|---|---|
| AAVE/EUR x2, JUP/EUR, ZEC/EUR, TRUMP/EUR | 0 | **0** |
| US/USD | 0 | 29,670 |

=> **FIVE OF SIX ARE `/EUR` PAIRS WITH ZERO SNAPSHOTS EVER - the crypto ticker archive does not cover EUR-quoted pairs at all.** One is a genuine momentary gap.
=> **SO SECTION 21's -0.4229% IS A USD-QUOTED-CRYPTO FIGURE, and is stated as that population from here on.** The archive's symbol coverage not matching the trading universe is adjacent to `#937`; it belongs to the new batch's measurement leg, which needs the coverage anyway.

### 22.5 THE CLEAN INSTRUMENT DOES NOT EXIST - CENSUSED, NOT ASSUMED

He asked for book mid vs ticker mid, same symbol, same instant, continuously, so that n stops being 18. **Censused: NO table in the schema matches `book|depth|orderbook` - zero rows. The book mid is NEVER PERSISTED**; `exit_book_mid` exists only on `closed_trades` (n=5).
=> **The instrument must be BUILT, which is why the measurement leg is a batch and not a query - and why every figure in section 21 is exit-derived by necessity, not by choice.**

### 22.6 COMPLETION-REPORT LANGUAGE - HIS, AND IT CLOSES MY `#941` CONCERN WITHOUT WIDENING THE BATCH

**F-G-2 MAY CLAIM: the decision reads the transactable SIDE of the price we hold.**
**F-G-2 MAY NOT CLAIM: the exit price is transactable.**
With the limit stated, naming the divergence and the batch that owns it.

**HIS STANDING: `RULED ON REPORTED FACT` on every figure in section 21** - the -0.4229%, the 16/18, the slippage median. **Per rule 29 that is DISQUALIFYING FOR A PROCEED on that leg, not a disclaimer** => the numbers carry no weight until re-derived on the built instrument.

