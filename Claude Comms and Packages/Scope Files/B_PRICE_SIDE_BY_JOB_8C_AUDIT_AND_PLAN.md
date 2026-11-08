# B-PRICE-SIDE-BY-JOB — ROW `8c` STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**change-class: architecture** (inherited from `3n` r5; this row changes how every crypto quant-lane level is constructed)
**Owner:** CC-C · **Read at ref:** `origin/migration/aws-supabase` = `022fd27ad` · **Deployed sha:** `2ce34ce33` · **Written:** 2026-09-13

> **ROW `8c` AS SCOPED:** *per-leg level construction for the crypto quant lane — a taker entry uses the ask, a resting maker entry the bid, and a long stop and target the bid; spread is counted once; bar lanes keep `venue_close` with age.*

---

## 0. PREVIOUSLY STATED / NOW

> **PREVIOUSLY STATED:** OBJ-8 rows `8f` and `8a` are both deployed; the remaining rows are `8b`-`8e` and `8g`-`8k`.
> **NOW:** rows `8f` and **`8l`** are deployed. **Row `8a` — the D1 side switch, *exits on the bid* — IS NOT BUILT.** The work deployed on 2026-09-12 under the label `8a` was D3's ladder at the xStock exit and is renumbered `8l`.
> **REASON:** established at the object 2026-09-13 while opening this row. Scope row `8a` has only ever read *exits on the bid*; the commit subject itself reads *row 8a: D3 at the xStock exit*. Correction commit `862d34cbc`. **`MISTAKE: wrong-object`** — the row id was matched by TABLE POSITION, never by ROW TEXT.

> **PREVIOUSLY STATED (by me, to a fresh reviewer, 2026-09-13):** re-basing a long's stop and target onto the bid while the trigger still reads the mid makes **both** legs fire earlier, by roughly a half-spread.
> **NOW:** **the two legs move in OPPOSITE directions.** A lower stop fires **LATER**; a lower target fires **EARLIER**.
> **REASON:** the operators are opposite and I did not check them — `tec-evaluator.ts:270` is `currentPrice <= input.stopPrice`, `:279` is `currentPrice >= input.targetPrice`. Re-derived at the ref. **This matters more than a sign tidy-up: the combination cuts winners early and holds losers longer, which is the worse of the two possible asymmetries, not a wash.**

---

## 1. THE AUDIT

### A1 — THE MACHINERY ROW `8c` NEEDS ALREADY EXISTS, IS LANGSTON-REVIEWED, AND IS DELIBERATELY UNWIRED

`server/core/calculations/level-basis.ts` (built `884b9289e`, 2026-09-05, OBJ-3a) implements the four roles exactly as `8c` requires — `priceForLevelRole` returns the **ask** for `entry_taker`, and the **bid** for `entry_maker_resting`, `stop` and `target`.

★ **CENSUS, repo-wide, tests excluded:** `buildLevelBasis` has **two** production call sites (`signal-orchestrator.ts:2623`, `vts-runner.ts:1578`) and **both terminate in `recordLevelBasisOutcome(...)`** — telemetry only. **`priceForLevelRole` has ZERO production callers.** The file says so itself at `signal-orchestrator.ts:132-133`: *"SHADOW at this commit: built and COUNTED, consumed by nothing"*, and again at `:2548`.

⇒ **Row `8c` is a SWITCH-ON, not a build.** That is the single most important fact for sizing it.

### A2 — THE SHADOW HAS BEEN RUNNING, AND ITS ANSWER IS THAT WE CANNOT SWITCH IT ON AS-IS

**MEASURED live 2026-09-13T05:40Z**, `/api/xstocks/filter-diagnostics` → `vtsEvaluation.levelBasisFunnel`. ⚠️ **In-memory and process-lifetime** (the module's own caveat): read as a RATE within one lifetime, never as a series. Process up since the `2ce34ce33` deploy at 2026-09-12T23:30:48Z.

| lane | attempted | accepted | refused | `no_book` | `stale_book` | ⛔⛔ **STRUCK 2026-09-14 (Langston, at the `8a-P1` Step-7 read) — THE ZEROS ARE UNEXERCISED ARMS, NOT MEASURED-CLEAN ONES.** `buildLevelBasis` tests both-sides-absent FIRST (`level-basis.ts:212`) and RETURNS IMMEDIATELY; `one_sided_book`, `non_finite_side`, `crossed_book`, `locked_or_synthetic_book`, `age_unknown`, `stale_book` and `implausible_spread` ALL sit below it (`:213-238`). ⇒ **on a population that is 100% `no_book`, those seven arms had ZERO OPPORTUNITY — `#661` leg 3.** ⛔ **SO NO SENTENCE OF THE FORM "the books we DO have are fine" or "not one stale_book" IS SUPPORTED BY THIS DATA — WE HAVE NONE, so their quality is UNMEASURED, not good.** ✅ **WHAT SURVIVES: `no_book` = BOTH SIDES ABSENT.** ⚠️ **And even that is undifferentiated — it pools "the venue gave us nothing" with "our own code path dropped it" (this batch's own `8A_P1_AUDIT` §A-6).** ★ **THREE INSTANCES OF THIS SENTENCE EXISTED ACROSS THE CORPUS AND ALL THREE ARE STRUCK IN ONE PASS — grep the class, never the instance.**
|---|---|---|---|---|---|
| `active:crypto_spot` | 546 | **16 (2.9%)** | 530 | **526** | 4 |
| `vts:crypto_spot` | 273 | **1 (0.4%)** | 272 | **272** | 0 |

**Every other refusal reason is ZERO** — `one_sided_book`, `crossed_book`, `locked_or_synthetic_book`, `non_finite_side`, `age_unknown`, `implausible_spread`. ⇒ **the refusal is almost entirely a single cause, and it is the ABSENCE of a book, not a bad book.**

### A3 — THE CAUSE, ESTABLISHED AT THE OBJECT: THE CRYPTO ORDER BOOK COVERS TWO SYMBOLS, NOT THE UNIVERSE

`signal-orchestrator.ts:2603` feeds the shadow from `krakenWebSocketAdapter.getBookForFill(symbol)`. The adapter subscribes **ticker and book on the same symbol list** (`kraken-websocket-adapter.ts:1499`/`:1514`).

**MEASURED — and the instrument's reach is stated because it nearly caught me out:** `out.log` rotates **by size (~1 GB), not only at midnight**, so today's file starts at 00:03Z and does **not** contain the 23:30:48Z boot. I therefore read **both** today's file and `out__2026-09-12_21-23-19.log`, which spans the boot.

| file | `Subscribing to` lines | largest subscribe |
|---|---|---|
| today, 00:03:01Z → 05:38:56Z | 376 (373 of them `AERO/USD` alone) | **2 symbols** |
| the boot file, 21:23Z → 00:00Z | 233 | **2 symbols** (`AERO/USD, SUI/USD`) |

⇒ **There is no bulk subscribe. The socket carries ticker+book for at most two names — the open positions — and the rest of the universe is REST-polled.** The 526 `no_book` are the ~500 scanned symbols that never had a book subscribed. **16 accepted ≈ 8 cycles × 2 subscribed symbols, which is the arithmetic the funnel should show if this reading is right.**

⛔ **THIS IS NOT FILED AS A DEFECT.** Rule 24: it is a hypothesis until its intent is read, and the architecture is plainly deliberate — a 500-symbol depth-10 book subscription is exactly the flood that row `8j` exists to trip on. **What it IS, for this row, is a hard constraint: the book cannot be the level basis for the level-building population.**

### A4 — THE SHADOW IMPLEMENTS ONLY RUNG 1 OF D3'S LADDER, AND THAT IS THE WHOLE GAP

D3 (decided 2026-09-11) is a **three-rung ladder**: a valid fresh **book top** → else the **ticker sides** inside D6's age → else **REFUSE**. Scope row `7d` states it in those words.

**The shadow call site passes one producer and one only** — `producer: 'kraken_ws_book'` (`signal-orchestrator.ts:2630`), with no second rung. **It was built 2026-09-05; D3 was decided 2026-09-11.**

⇒ **The shadow predates the decision it is now being read against. Its 97% refusal measures the absence of rung 2, not the unavailability of a transactable price.**

### A5 — RUNG 2 IS REAL, NOT FABRICATED — CHECKED, BECAUSE THE OPPOSITE WAS PLAUSIBLE

The known hazard is `price-cache.ts` writing `ask: existing?.ask ?? price, bid: existing?.bid ?? price`, which on a first write makes `bid === ask === price` — a synthetic zero-spread book. **That hazard does NOT apply to the REST ticker poller**, which genuinely observes both sides (`ticker.a`, `ticker.b` at `price-cache.ts:409-410`), dates them with `sidesCapturedAtMs`, and states `venueObservedAtMs: null` rather than inventing one.

★ **So the ~500 REST-priced symbols DO carry a real, dated bid and ask.** Rung 2 is a genuine transactable basis, and `8c` is buildable.

### A6 — DIRECTION: THE TWO LEGS MOVE OPPOSITE WAYS, AND I HAD THIS WRONG

`tec-evaluator.ts:270` `currentPrice <= input.stopPrice` · `:279` `currentPrice >= input.targetPrice`. For a long, moving a level from the mid onto the (lower) bid:

- **stop — fires LATER.** The mid must fall further to reach a lower stop.
- **target — fires EARLIER.** The mid reaches a lower target sooner.

⛔ **That is the worse asymmetry, not a wash: winners cut early, losers held longer.** It is also precisely why the coherence assertion (OBJ-3b) exists, and why an interim in which levels move and the trigger does not is a state to avoid rather than pass through.

### A7 — THE BOOKED EXIT IS CLAMPED TO THE LEVEL, SO THIS CHANGES P&L, NOT ONLY TIMING

`tec-evaluator.ts:275` returns `exitPrice: input.stopPrice` and `:284` `exitPrice: input.targetPrice` — the **level itself** ⚠️ *(corrected from `:273`/`:282`, which are the `shouldExit` lines — Langston, 2026-09-13. Immaterial to the conclusion, wrong as a citation.)*, not the price that triggered it. ⇒ **re-basing a level re-bases what gets BOOKED on every stop and every target.** Any observation window on this row must read the booked price, not only exit timing.

### A8 — THE TRAILING RATCHET IS OFF, SO THE CONSTRUCTED LEVEL IS THE OPERATIVE ONE

**MEASURED live**, `module_constants` where `module_name = 'trailing_exit'`: `trailing_enabled_active = false` and `trailing_enabled_vts = false` on **all four** asset classes since 2026-07-23; `break_even_enabled = false` on all four.

⛔⛔ **THE CONCLUSION HOLDS, BUT MY MECHANISM WAS WRONG — AND SO WAS THE ONE OFFERED BACK TO ME. ESTABLISHED AT THE OBJECT, 2026-09-13.**

**Langston ruled that with `trailing_enabled_active` false, `useTrailing` is false, so `tec-evaluator.ts:268`'s hard block IS the live exit path. That is not what the code does.** `useTrailing: true` is a **LITERAL** at all five call sites (`active-execution-engine.ts:2209`/`:2277`, `vts-runner.ts:3232`/`:4029`) and is never read from config. The flag gates `isMoonbagQualifier` (`trailing-exit-controller.ts:516-517`) — a different thing. ⇒ with `atr > 0` the `:268` block is **SKIPPED**, and `:294` `if (input.useTrailing && input.atr > 0)` routes every live decision into the trailing controller. **The hard block fires only when ATR is unavailable.**

★ **THE ACTUAL REASON THE CONSTRUCTED LEVEL DECIDES — CENSUS OF EVERY WRITE:** `state.currentStopPrice` has exactly **one** mutation site, `trailing-exit-controller.ts:1292`, writing `newStopPrice`, which is reassigned in only **two** branches — `targetLatched` (`:1261`) and `breakEvenLatched` (`:1277`). **Break-even is off on all four classes, with 0 latches in 705 states.**

⇒ **Before a position latches its target, `newStopPrice` is the constructed stop written back unchanged, and `tecShouldClose` (`:1581`) compares against it.** The target side is equally direct: `isTargetLockTriggered` is `currentPrice >= targetPrice` against the **constructed** target.

⇒ **The level `8c` constructs is the level that decides, for every position before target-latch. This makes the change MORE consequential, not less** — nothing absorbs it. ★ **The ratchet is not absent because a master switch is off; it is absent because nothing has latched yet.**

### A9 — OBJ-3b IS NOT ASSERTABLE, AND THE REASON HAS CHANGED

The scope's §7.1 says OBJ-3b *"BECOMES ASSERTABLE in OBJ-8c, because the trigger moves to the bid in the same layer."* **The trigger does not move in this layer, because row `8a` is not built** (§0 above). Verified at the object: `active-execution-engine.ts:2220-2221` — *"The live decision above read the book MID"* — and the bid arm beneath it is `F-G-2` OBJ-0's shadow, which *"NEVER closes a position."*

★ **This supersedes the disposition I recorded on 2026-09-12 from `F_G_2_COMPLETION_REPORT.md` at `90f22b990`.** That read was answering *"what did F-G-2 decide"* — a question r5 had already retired when it moved the switch into this batch as row `8a`. **The honest reason OBJ-3b cannot ship is nearer and simpler: its other half is unbuilt, and it is mine to build.**

### A10 — THE SPREAD IS ALREADY COUNTED ONCE, IN THE COST MODEL

`SYSTEM_MANUAL.md:699-701`: `executionEntry = baseEntry × (1 + slippage + spread/2)`. ⇒ **moving the entry onto the ask without reconciling that term counts the spread twice.** The scope row names *"spread is counted once"* as a requirement; this is the object it refers to.

### A11 — THE SWEEP LANGSTON ORDERED (condition 2): the row-id mismatch IS a class, and it returned a second instance

He ruled that matching `8a` by table position is `fix-follows-pointer` and told me to re-read every other `3n` row id I had cross-referenced positionally. **Done — by ROW TEXT, not position. What it returned:**

| row | the claim I made | what the row text says | verdict |
|---|---|---|---|
| `8a` | the D3 xStock exit refusal shipped here | *exits on the bid* | ⛔ **MISMATCH** — corrected, renumbered `8l` |
| `8f` | non-USD quote admission gate, deployed | *Non-USD pairs are refused new admission* | ⚠️ **TEXT DRIFT — second instance, below** |
| `7c` | the basis vocabulary | *records its basis: `book_top` / `ticker_bbo` / `ticker_default` / `venue_close`* | ✅ matches |
| `7d` | D3's three-rung ladder | *a valid, fresh book top; otherwise a valid ticker within D6's age; otherwise refuse* | ✅ matches — **but see A12** |
| `7b` | the xStock book plus the unsubscribe precondition | same | ✅ matches |

⚠️ **THE SECOND INSTANCE, `8f`: D9 AND THE SHIPPED GATE DISAGREE — AND THE SHIPPED ONE IS THE REVIEWED ONE.** D9 reads *"new admission is refused … for any pair **not quoted in USD**"*. The gate admits `ADMITTED_QUOTES = ['USD','USDT','USDC']`, and the deploy admitted **9 USDC + 6 USDT** distinct symbols. **A USDT-quoted pair is not quoted in US dollars.**

★ **This is NOT a defect and I am not re-litigating it.** The three-quote set was deliberate, documented at its definition site, reviewed across six rounds, and its monitoring gap is already homed at row `3n.g` — *"the test is SET MEMBERSHIP, never is-it-pegged."* **What is wrong is the DECISION TEXT, which still describes a narrower rule than the one we shipped.** ⇒ **D9's wording is corrected to name the admitted set, at Step 10. The code does not move.**

★ **THE SWEEP EARNED ITS KEEP: one instance is a slip, two is the class Langston named.** Both are the same shape — **a record describing something narrower than, or other than, the thing that shipped.**

### A12 — D3's LADDER IS ALREADY BUILT, AND IT TOO IS UNWIRED — SO P1 IS A CALL, NOT A BUILD

`server/core/calculations/touch-price.ts` exports **`selectTouchPrice`** (`:91`), whose own docstring reads *"Choose the touch price by D3's order: a valid fresh book top, then valid ticker sides within the age, else refuse"*, returning `TouchBasis = 'book_top' | 'ticker_bbo' | 'ticker_default'` — **row `7c`'s vocabulary exactly.**

★ **CENSUS: `selectTouchPrice` has ZERO production callers** — one unit test, and one comment mention in `price-basis.ts`. **The same shadow state as `level-basis.ts`.**

⇒ **P1 collapses from "implement the ladder" to "call the ladder that already exists".** The level-construction shadow calls `buildLevelBasis` with `producer: 'kraken_ws_book'` — rung 1 only; it should call `selectTouchPrice` with both legs. ⚠️ **The xStock exit refusal (`8l`) implements D3's rule INLINE in the engine rather than through this module — which is why the rule is live in one place while the shared module has no callers at all.**

---

## 2. THE PLAN — every item back-references its finding

| # | item | from |
|---|---|---|
| **P1** | **Call `selectTouchPrice` from the level-construction shadow instead of `buildLevelBasis` directly**, so rung 2 of the ladder becomes reachable. The rung taken is recorded in row `7c`'s vocabulary. **STILL SHADOW — nothing consumes the result.** | A3, A4, A5, **A12** |
| **P2** | **Re-measure the funnel on the ladder before anything switches on, with the acceptance floor PRE-REGISTERED** — and a **positive control**: the refusal arm must be shown firing on a constructed absent-sides fixture, or a low `no_book` count is unreadable. ⛔ **LANGSTON CONDITION 1: shadow rows collected BEFORE the ladder re-base are a DIFFERENT POPULATION. Label the boundary at the re-base commit and never pool across it.** | A2 |
| **P3** | **Wire `priceForLevelRole` into the crypto quant lane**, per leg, with a fixture per role and a mutation that reverts one leg to the mid. | A1, A6 |
| **P4** | **Reconcile the `spread/2` entry term** so the spread is counted exactly once across level construction and the cost model, with the arithmetic written down. | A10 |
| **P5** | **OBJ-3b does NOT ship with this row**, and the recorded reason is replaced: not *"F-G-2 has no disposition"* but *"row `8a` is unbuilt and the trigger still reads the mid."* | A9 |
| **P6** | **The observation window reads the BOOKED exit price, not only exit timing**, and is sized on stamped closes. | A7, A8 |

⛔ **`UNAUDITED`: nothing in the plan is unaudited.**

---

## 3. THE JUDGEMENT CALL I WANT ATTACKED

**Should row `8c` switch on at all before row `8a`?**

My reading is **NO — they should land together**, because A6 + A7 + A8 compose into a live change that cuts winners early, holds losers longer, and re-bases what is booked, with **no ratchet to absorb it and no coherence assertion able to catch it.**

**The alternative reading is that P1+P2 — the ladder plus its measurement, still shadow — are worth landing alone**, which is cheap, reversible, and tells us the acceptance rate we need before committing to either order.

⇒ **I recommend exactly that: land the shadow half now, hold the switch-on until `8a` is built.**

### ✅ RULED 2026-09-13 — **HOLD THE SWITCH-ON. SHADOW HALF APPROVED.** (Langston, re-derived at `b0c8e2dbc`, not reported fact)

⭐ **AND HE RE-ORDERED MY REASONS, CORRECTLY: THE ONE I LED WITH IS NOT THE ONE THAT BLOCKS IT.**

1. ⛔ **THE BLOCKING REASON, which I had buried in my closing paragraph: 530 of 546 refused.** At switch-on the basis is uncomputable for **97%** of level builds ⇒ we ship a **MIXED POPULATION** — bid-anchored for a handful of symbols, mid-anchored for the rest — and **every resulting exit is unattributable in analysis. That blocks `8c` on its own, independently of `8a`.**
2. ⛔ **THE FIDELITY CASE FOR SWITCHING EARLY IS EMPTY, and this is the objection to pre-empt in the scope.** Fire on `mid >= bidTarget` ⇒ the real bid is still half a spread *below* the level booked at `:284`. Fire on `mid <= bidStop` ⇒ the real bid is *below* the level booked at `:275`. **Both remain optimistic, with the SAME SIGN as today** ⇒ **the switch-on buys zero honesty in what gets recorded, and pays for it in the timing skew.** ★ *"It is the transactable side, so it must be more honest"* is the objection this answers.
3. ⛔⛔ **HIS FOURTH REASON IS STRUCK — IT IS WRONG AT THE REF, AND THE DIRECTION IS THE OPPOSITE OF WHAT IT CLAIMS (CC-C, re-derived 2026-09-13).** He gave: *"`F-G-2`'s crypto observation window is OPEN … switching on mid-window costs that window outright."*
   **`F_G_2_COMPLETION_REPORT.md` at `origin/migration/aws-supabase`, title line 1: *"WINDOW VOID 2026-09-05, AWAITING RE-OPEN"*; §0: *"THE OBJ-0 OBSERVATION WINDOW … IS VOID. IT IS NOT RUNNING. NOTHING BELOW THIS SECTION IS A LIVE MEASUREMENT UNTIL A NEW ANCHOR IS RECORDED HERE."*** **No re-open anchor is recorded** — grepped, with a control: the same grep finds `VOID` **17 times**, so it is not a silent instrument.
   ⇒ ★ **There is no open window to cost, and §32 sets the order as *"`B-PRICE-SIDE-BY-JOB` finishes and deploys → the reachability work → THEN this window re-opens against the changed system."* THIS BATCH FINISHING IS THE WINDOW'S PRECONDITION, NOT A THREAT TO IT.**
4. ✅ **The timing asymmetry (A6) stands, as a supporting reason rather than the lead.**

✅ **SO THE HOLD RESTS ON THREE REASONS, NOT FOUR — AND IT IS UNAFFECTED.** The blocker (1) is independent and untouched; (2) and (4) stand. ⛔ **The correction is recorded rather than quietly dropped, because a ruling carried into the scope with a false reason attached is how a later reader re-opens a settled decision on the wrong grounds.**

★ **AND IT SETTLES A STEP-6 QUESTION RATHER THAN RAISING ONE: the SHADOW half's deploy perturbs no window either.** The `F-G-2` shadow arm does keep recording (§0 item 2) and a restart wipes its per-position trailing state (`${position.id}:fg2bid`) — **but with the window void nothing is measuring, so that costs nothing.** Stated in the deploy record rather than left to be discovered (`workflow-06`: *ask what warm state this restart destroys*).

---

### ✅ RE-RULED 2026-09-28 — **THE HOLD LIFTS, WITH FOUR CONDITIONS** (Langston, re-derived at `94533f1bf`, not reported fact; CC-C asked because Kyle wants all midpoint work finished before the push)
- **Reasons 2 and 4 are DISCHARGED:** the crypto trigger is the bid in both lanes (`8a-P2`, `8a-P3`), and the evaluator compares `triggerPrice`, not the mark. ★ **A7 lost most of its weight in the same change:** paper books the depth walk across the bids and VTS books the bid, so the clamped level is now a fallback arm, not the main path. Do not carry A7 at its old force.
- ⛔ **Reason 1 is NOT discharged by the 99.944% (§3c).** He could not read it independently: the endpoint returns 401 to him, there is no log sink, and the only dump is from a dead lifetime. Reported fact is disqualifying for a PROCEED on the leg it covers. **He discharges it differently, and more strongly: the mixed population is made IMPOSSIBLE BY CONSTRUCTION.**
- **CONDITION 1 — NO FALLBACK, BY CONSTRUCTION, FENCED:** no transactable basis ⇒ the signal is REFUSED; no midpoint fallback at any leg (the §18.0.1 trigger rule, applied at level build). Verified at Step 4 from the diff, plus a mutation reverting one leg to the mid, which must fail.
- **CONDITION 2 — `8c` CHANGES SIGNAL ADMISSION, NOT ONLY EXITS (new, disposition 1: fold into the switch-on scope before Step 3).** A taker entry on the ask and a stop/target on the bid widen risk and narrow reward by about a full spread. `expectancy.ts:600` (`risk = |entry − stop|`) and `:346` (`roi`) feed the `minRR` floors (`:264`/`:249`) and the EV gate, so floors calibrated on mid-based geometry will newly refuse signals that pass today. That is a truth reveal, not a defect, but it is an unsized live change. The scope carries: **a pre-deploy admission-delta estimate** (stored geometry re-scored on sides); **an explicit hold-or-re-derive statement on the floors** (Langston: HOLD is right under his 2.4g-3 ratchet, stated as a choice); and **a census of what reads `dollarRiskAtStop`**, because sizing is fixed-notional and a wider stop raises dollar risk at the same notional.
- **CONDITION 3 — the provenance read, plus the sides' AGE at level build.** Under switch-on a level stops being an estimate (A8 stands), so the looser `LEVEL_BASIS_OBSERVATION_*` ceilings are RE-JUSTIFIED, not inherited. ⛔ **Anchor this read AFTER the 2026-10-02 deploy and record the rung mix.** That deploy lands `3n.l` and the restart-durable book ring (`3n.q8`), which can move the book-rung coverage the read measures; read across it and it is a mixed-cause reading.
- **CONDITION 4 — the owed second-party funnel read path, HOMED.** `3n`'s close cites §3b regardless of `8c`, so Langston must be able to read the funnel himself. **HOME (§9.4 disposition 2):** an item of the `8c` switch-on, owner CC-C, built with it and in place BEFORE `3n` closes: the funnel counts written somewhere a second party can read at the ref or on the box (a log line or a dump on a cadence), never only the authenticated endpoint.
- **PLACEMENT (not a date):** after `3n.l` increments 1+2 deploy, before the push-to-live gate.

## 3b. ⛔⛔ P2's CRITERION — **PRE-REGISTERED 2026-09-13, BEFORE THE DEPLOY AND BEFORE ANY READING**

★ **Written now because a criterion chosen after seeing the window can always be made to pass.** The instrument is the `ladder` funnel cell against the `book` cell, read from `/api/xstocks/filter-diagnostics` → `vtsEvaluation.levelBasisFunnel`.

**THE QUESTION THIS ANSWERS, and it is narrow: how much of the 97% refusal was rung 2 being absent rather than no transactable price existing?**

| | |
|---|---|
| **POPULATION** | `active:crypto_spot` and `vts:crypto_spot`, **reported separately, never pooled** — they have different cadences and different symbol sets. |
| **WINDOW** | ⚠️ **The funnel is in-memory and process-lifetime.** The window is **ONE uninterrupted process lifetime** beginning at the deploy's restart. A restart ends the window; it does not extend it. |
| **ANCHOR** | ⛔ **`2026-09-13T07:08:52.378Z`** — pm2 `pm_uptime` on the `cf535acb2` deploy, **NOT** `dt-deploy`'s `deployed_at` (`07:09:02Z`), which is its post-check stamp 10 s later. ★ **WRITTEN HERE, IN §3b ITSELF, BECAUSE §3c OBLIGES CARRYING THIS SECTION *VERBATIM* AT CONVERSION** — it previously lived only in the change list and in memory, so the conversion would have carried a pre-registration with no start time (Langston CONDITION 1, `B-REST-SIDES-TO-CACHE` r4). **Re-read `pm_uptime` before comparing any two readings: if it has moved, they are different lifetimes.** |
| **n-FLOOR** | **≥ 2,000 `ladder.attempted`** in the lane being read. Below it ⇒ `INCONCLUSIVE-EXTEND`, **never a PASS**. *(The pre-deploy reading took 546 in ~6 h on the active lane, so this is roughly a day — deliberately not a date.)* |
| **MANDATORY POSITIVE CONTROL** | **`ladder.refused` must be NON-ZERO**, and `book.refused` must be non-zero. **A zero numerator beside a zero control means the recorder never ran** — the `#661` leg-3 shape this batch has now hit three times. A reading with a zero control is **VOID, not a pass.** |
| **ARITHMETIC GATE, checked first** | **`book.attempted === ladder.attempted`.** Unequal ⇒ the recorder is broken ⇒ the reading is **VOID** and nothing else in it may be cited. *(Langston's suggestion, adopted: the redundancy becomes a live control at no cost.)* |

**THE PRE-REGISTERED OUTCOMES — all three named before the data, so none can be chosen afterwards:**
- ✅ **RECOVERY CONFIRMED** — `ladder.accepted / ladder.attempted` **≥ 50%** on the active lane. ⇒ the book's absence was **not** the binding constraint, the 97% was rung 1's coverage, and `8c`'s switch-on becomes a question about the *trigger* rather than about price availability.
- ⚠️ **PARTIAL** — between **10%** and **50%**. ⇒ rung 2 helps materially but a large residue is genuinely unpriceable; **the switch-on then needs a refusal policy** (what a level does when no basis exists) before it can be argued at all.
- ⛔ **REFUTED** — **< 10%**. ⇒ the ticker sides are not usable at level-build time for most symbols, and the reason must be read off `ladder.byReason` (`stale_ticker` vs `locked_or_synthetic_ticker` vs `ticker_age_unknown`) **before** anything else is proposed.

⛔⛔ **AMENDED 2026-09-13, BEFORE ANY DATA — LANGSTON RIDER 2, AND IT FORBIDS THE READING THE `REFUTED` BRANCH ORIGINALLY LICENSED.**
**A LOW LADDER RECOVERY MAY *NOT* BE READ AS "THE TICKER SIDES AREN'T THERE."** Re-derived at the object: `live-pricing-adapter.ts:876-877` parses `a[0]` and `b[0]`, logs them at `:890`, and then calls `updateFromRest(normalized, midpoint, …)` at `:896` — **the sides are discarded one line before the store.**
★ **THERE ARE (AT LEAST) TWO REST WRITERS AND THEY DISAGREE:** the `price-cache.ts` poller (`:409-410`) genuinely stores `ticker.a`/`ticker.b` with `sidesCapturedAtMs` — **that is the writer A5 was established on, and A5 stands for it** — while this adapter path stores only the mid. ⇒ **a symbol's sides depend on which writer last touched it**, so rung 2's recovery carries a floor that is **an artefact of our own write path, not of the venue.**
⇒ ⛔ **THE `REFUTED` BRANCH IS THEREFORE NOT SELF-INTERPRETING. Below 10%, the FIRST question is the writer mix, not the venue** — and `B-REST-SIDES-TO-CACHE` (placed after `8c`, before `8a`) is what removes the floor. **My original wording — *"my A4/A5 reading is wrong"* — is struck: it named the wrong object and would have sent the next reader at the feed instead of at us.**

⚠️ **AND RIDER 1 BINDS THE SPLIT ITSELF: `producer` comes from `lastSource`, which dates the MARK's writer, not the SIDES' writer.** WS-pushed sides sitting under a later REST mark are recorded as `ticker_bbo:kraken_rest`. **The bias UNDERSTATES pushed transport** — conservative, same direction as the venue-skew note — so **`byAcceptedSource` is a LOWER BOUND on the pushed share and may never be cited as its measurement.**

⛔ **AND THE TRANSPORT SPLIT IS READ BESIDE IT, NOT AFTER IT** (Langston condition 1): `byAcceptedSource` is reported with every outcome above. **A recovery carried overwhelmingly by `ticker_bbo:kraken_rest` is a recovery on a POLL CADENCE**, which is a materially weaker claim than one carried by pushed sides — and the switch-on argument turns on exactly that distinction. **The headline percentage may not be cited without its split.**

### ⛔⛔ AMENDED AGAIN 2026-09-13, STEP 8 — TWO AMENDMENTS WRITTEN **BEFORE** THE WINDOW ACCUMULATES, NOT AFTER

**F2 — `byAcceptedSource` IS NOT REPORTABLE FOR THIS WINDOW, AND *"ZERO PUSHED"* MAY NOT SURVIVE TO THE CLOSE AS A FINDING** (Langston, blocker). Two independent reasons, and **neither shrinks with n**:
1. **The bias is structural.** `producer` comes from `lastSource`, which dates the **mark's** writer; `updateFromRest` stamps `kraken_rest` unconditionally while the sides carry forward ⇒ **WS-pushed sides under a later REST mark record as REST.** More samples do not dilute a systematic mislabel.
2. **The first reading sits inside the boot-subscribe lag** (`#571` obl. 46) — taken 3.4 min after a cold start — **and the counter is cumulative with no timestamps, so those frames stay in the denominator permanently.**
⇒ ⛔ **THE TRANSPORT SPLIT IS UNINTERPRETABLE FOR THIS WINDOW unless `producer` is sourced from the SIDES' writer.** ★ **It is still RECORDED — the field stays — but it may not be cited as a measurement of the pushed share, at Step 7, at the close, or anywhere between.** *(This supersedes the weaker "lower bound" phrasing above: a lower bound is still a number someone will quote.)*

**F3 — THE n-FLOOR MAY BE UNREACHABLE IN ONE LIFETIME, AND THE FLOOR DOES NOT MOVE.** Langston measured the steady rate from my own two readings, same book-cell population: **pre-change 546 active attempts over the 23:30:48Z→05:40Z lifetime = 1.48/min; 273 vts = 0.74/min.** My 07:12 reading is **7.3 and 13.6/min — 5× and 18×** — because **the first three minutes is a cold-start burst, not the rate.** ⇒ at the steady rate, 2,000 is **≈22.5 h uninterrupted on active and ≈45 h on vts**, against `restart_time=613` and a queued `3n` deploy.
⛔ **THE FLOOR IS NOT LOWERED. A criterion moved after seeing the window measures nothing.** Instead, pre-registered now:
- **A RESTART VOIDS THE WINDOW — it does not yield a partial reading**, per S27's own rule. A voided window re-anchors at the new `pm_uptime`; readings are never summed across lifetimes.
- **A DEPLOY HOLD WITH A NAMED OWNER (CC-C) is required for the window to have a chance** — and every `3n` row still to ship is a restart. ⇒ **the window runs in the gaps between rows, and I state which lifetime a reading belongs to or the reading is void.**
- **IF CONSECUTIVE LIFETIMES FAIL TO REACH n, THE FLOOR IS RE-RULED ON THE *MEASURED* RATE, IN WRITING, BEFORE THE NEXT WINDOW OPENS** — never mid-window, and never against data already seen.

**F1 — THE ACTIVE LANE IS *NOT* STRUCTURALLY SATURATED, so the floor does buy something there. Answered before the close, as asked.**
Both lanes' level-basis calls sit behind `activeFilterPool.getActivePool(…)` machinery, but over **different sets**: the active lane iterates the **FX5-survivor pool**; the VTS call at `vts-runner.ts:1613` sits inside the loop over the **wider `cryptoSymbolList`**. **They share ONE cache**, and `live-pricing-adapter`'s `updateFromRest` — the path that writes the synthetic `bid = ask = price` on a first write — is reached for **open positions**, which are FX5 survivors by construction.
⇒ ✅ **An active-lane symbol CAN carry a locked/synthetic ticker. There is no structural exclusion, so that cell is not saturated at 100% by construction and the n-floor is doing real work on it.**
⚠️ **What differs is RATE, not possibility:** FX5 survivors are scanned repeatedly and accumulate real sides, so the synthetic shape is **rarer** there — and **most likely right after a restart, before the side-storing poller has covered a symbol, which is exactly when the 07:12 reading was taken.**
⛔ **NOT ESTABLISHED: whether the FX5 pool is a strict subset of `cryptoSymbolList`.** I did not trace it and am not asserting it; the conclusion above does not rest on it.

⚠️ **AND A LIMIT ON MY OWN REPORTING THAT LANGSTON NAMED: he is `RULED ON REPORTED FACT` on the funnel counts, because the diagnostics endpoint returns 401 to him and he holds no session.** ⛔ **That is tolerable only while no PASS rests on them; at the close it is DISQUALIFYING.** ⇒ **a second-party read path is owed before the close — a token, a logged line, or a sink.**
⛔⛔ **THIS SENTENCE WAS OVER-BROAD AND IS CORRECTED 2026-09-13 (Langston, correcting reasoning he had adopted from me).** It read: *“it may not be built now — a logged line or a sink is RUNTIME CODE, and shipping it RESTARTS THE ENGINE, which VOIDS THIS WINDOW.”*
✅ **TRUE OF A SINK. NOT TRUE OF A `curl`.** An out-of-band request writing its response body to a file **ships nothing and voids nothing** ⇒ **the read path can land the same day, and the deferral below does not reach it.**
★ **THE SHAPE OF MY ERROR: I generalised from the EXPENSIVE member of the class to the whole class.** *“A read path is runtime code”* was true of the instance I had in mind and false of the cheapest one available — and the cheap one was sufficient.
✅ **DONE, `2026-09-13T09:45:59Z`:** raw unedited response body at `/var/log/dawntrader/8c-levelbasis-funnel-20260913T094558Z.json`, 50,814 B, `sha256 126000aed2bd0e7d`. **`pm_uptime` read IMMEDIATELY BEFORE AND AFTER and identical (`1789283332378`)** ⇒ the lifetime is provably unbroken ACROSS the dump, not merely around it.
⚠️ **STATED PLAINLY, IN HIS WORDS: THIS REMAINS A ONE-PARTY READ. It removes TRANSCRIPTION risk and gives OBJECT IDENTITY. It does NOT give party independence** — and the deploy hold stays until he has read it, because these counters are in-memory and cumulative: a restart first would make this reading unreproducible and re-accrue into a different lifetime with a different cold-start mix.
⇒ ✅ **DISPOSITION: the read path lands at the NEXT NATURAL RESTART — the next `3n` row's deploy — never as a restart of its own.** In the meantime the counts carry `RULED ON REPORTED FACT` **and nothing may rest on them**, which is exactly the standing they have today.

⛔ **WHAT THIS CRITERION DOES NOT DECIDE, stated so it is not over-read: it says nothing about whether the switch-on should happen.** That is held on four separate grounds (§3), and a PASS here removes none of them. **It measures one thing: whether a transactable basis exists for the level-building population.**

---

## 3c. ⛔ WHERE THIS CRITERION LIVES, AND WHY THERE IS NO BATCH PROGRESS REPORT YET — the judgement stated out loud

**MEASURED:** no `B_PRICE_SIDE_BY_JOB_*_PROGRESS_REPORT.md` exists (control: five other batches have one, so the check is not a silent instrument).

★ **THAT IS CORRECT TODAY, AND IT IS A JUDGEMENT, NOT AN OMISSION.** `workflow-10`'s trigger is *"the work has been done, the code deployed, and now we're at an observational period"* — **a batch that cannot close because it is WAITING.** `3n` cannot close for a different reason: **rows `8a`, `8b`, `8d`, `8e`, `8g`-`8k` are not built.** It is mid-IMPLEMENTATION, not mid-OBSERVATION, and a progress report written now would describe a batch state that does not exist.

⇒ ⛔ **THE OBLIGATION THIS CREATES INSTEAD, recorded here so it cannot be lost between the two documents: `3n`'s progress report becomes due when the LAST row ships and only windows remain — and when it is written, §3b's criterion above MUST be carried into it VERBATIM, with its pre-registration date, not re-derived.** ★ **A criterion re-stated from memory at conversion time is a criterion chosen after seeing the data, which is the one thing its pre-registration exists to prevent.**

---

## 4. SECOND-READER RECORD

`REVIEWER r1: claim-only (mode B) · what other states of the world are consistent with the objects that settle "re-basing levels onto the bid makes both legs fire earlier" · HIT · re-derived y`

It named the opposite operators at `tec-evaluator.ts:270/:279`, the level-clamped `exitPrice`, the ratchet question, and the `spread/2` double-count. **Every one was re-derived at the ref before use** (A6, A7, A8, A10).

It also read staging as `2dbc512ee` — from a **stale section of my own change list**, which is a record defect I own and have now dated rather than deleted.

---

## 3c-READ. ⭐⭐ THE WINDOW READING — 2026-09-13T15:04Z, **475.4 min into the lifetime anchored at `07:08:52.378Z`**

⛔ **ANCHOR RE-READ BEFORE COMPARING ANYTHING, as §3b obliges: pm2 `pm_uptime` = `2026-09-13T07:08:52.378Z`, UNCHANGED, `restart_time` 613.** ⇒ **same lifetime as the Step-7 reading; this is an EXTENSION of that window, not a second one.** Instrument as pre-registered: `/api/xstocks/filter-diagnostics` → `vtsEvaluation.levelBasisFunnel`.

### THE GATES, CHECKED FIRST AND IN THE PRE-REGISTERED ORDER

| gate | requirement | active:crypto_spot | vts:crypto_spot | |
|---|---|---|---|---|
| **ARITHMETIC** | `book.attempted === ladder.attempted` | 37,220 = 37,220 | 26,478 = 26,478 | ✅ not VOID |
| **POSITIVE CONTROL** | `ladder.refused` AND `book.refused` both non-zero | 21 · 37,187 | 6 · 25,679 | ✅ not VOID |
| **n-FLOOR** | ≥ 2,000 `ladder.attempted` | **37,220 = 18.6×** | **26,478 = 13.2×** | ✅ PASS |

### THE OUTCOME, AGAINST THE THREE NAMES WRITTEN BEFORE THE DATA

**`ladder.accepted / ladder.attempted` — reported separately per lane, never pooled:**

| lane | book rung | **ladder rung** | recovery |
|---|---|---|---|
| **active:crypto_spot** | 33 / 37,220 = **0.089%** | **37,199 / 37,220 = 99.944%** | **+37,166 level builds** |
| **vts:crypto_spot** | 799 / 26,478 = **3.018%** | **26,472 / 26,478 = 99.977%** | +25,673 |

⇒ ✅✅ **RECOVERY CONFIRMED** on the active lane (**99.944% ≥ 50%**), and the criterion's own consequence follows as written: *"the book's absence was **not** the binding constraint, the 97% was rung 1's coverage, and `8c`'s switch-on becomes a question about the *trigger* rather than about price availability."*

★ **AND IT CORROBORATES `#1060` FROM THE OPPOSITE DIRECTION.** The book rung refuses **37,187 of 37,187 for `no_book`** — not one `stale_book`, not one `crossed_book`, not one `one_sided_book` on the active lane. **The book is not failing quality checks; it is ABSENT.** That is `#1060`'s finding measured on a second instrument, over 8 hours and 37,220 attempts.

### THE REFUSAL ARMS THAT FIRED — which is what makes the zeros beside them readable

| arm | active | vts | |
|---|---|---|---|
| `locked_or_synthetic_ticker` | 11 | 6 | ✅ the fabrication guard is LIVE |
| `stale_ticker` | 10 | 0 | ✅ fires |
| `stale_book` | 0 | 16 | ✅ fires (on the lane that has books) |
| `no_book` | 37,187 | 25,663 | the whole book-rung refusal |

⛔ **STATED RATHER THAN CLAIMED AS CLEAN: `crossed_book`, `one_sided_book`, `non_finite_side`, `age_unknown`, `implausible_spread`, `book_not_eligible`, `no_ticker`, `one_sided_ticker`, `crossed_ticker`, `non_finite_ticker_side`, `ticker_age_unknown` and `implausible_ticker_spread` all read ZERO and NONE of them has been shown able to fire in this window.** Those zeros are **uncontrolled** and carry no information. Only the four arms above are positively controlled.

### ⛔⛔ THE TRANSPORT SPLIT — REPORTED BESIDE THE HEADLINE, AND **NOT** CITED AS A MEASUREMENT

Per the Step-8 F2 amendment, which is binding and was written before this window accumulated:

| lane | `byAcceptedSource` as recorded |
|---|---|
| active ladder | `ticker_bbo:kraken_rest` 37,166 · `book_top:kraken_ws_book` 33 |
| vts ladder | `ticker_bbo:kraken_rest` 25,667 · `book_top:kraken_ws_book` 799 · **`ticker_bbo:kraken_ws` 6** |

⛔ **THIS IS RECORDED AND UNINTERPRETABLE, EXACTLY AS PRE-REGISTERED. `producer` comes from `lastSource`, which dates the MARK's writer, so WS-pushed sides under a later REST mark record as REST — a systematic mislabel that DOES NOT SHRINK WITH n.** ⇒ **the pushed share is NOT measured here, at this reading or at the close, and "overwhelmingly REST" may not be written down as a finding.** `B-REST-SIDES-TO-CACHE` (`#1056`, row `3n.l`) is what removes the floor.
★ **ONE THING THE EXTENDED WINDOW *DOES* ADD, and it is a control rather than a measurement: `ticker_bbo:kraken_ws` is NON-ZERO on the vts lane (6).** ⇒ **the field is capable of recording a WS source; the near-total REST reading is not a structurally stuck value.** That removes one alternative explanation. **It does not make the share interpretable** — a systematic bias and a reachable code path are different things.

### WHAT THIS READING DOES **NOT** SETTLE
- ⛔ **The switch-on stays HELD.** Langston's hold rests on three reasons, none of which is price availability; this reading answers only the availability one. Levels on the transactable side against a mid-reading trigger still ship a MIXED POPULATION until row `8a` moves the trigger.
- ⛔ **The 99.944% is a recovery of *a basis being nameable*, not of *the basis being right*.** Whether the named side is the correct side for the job is `3n`'s question, not this one.
- ⚠️ **One lifetime, one instrument, in-memory.** A restart ends it.

---

## 5. ⭐ STEP-2 AMENDMENT 1 (CC-C, 2026-11-06) — CONDITION 3: THE AGE OF THE SIDES AT LEVEL BUILD, AND THE RUNG MIX

**Why now:** the 09-28 re-ruling lifts the hold on four conditions and anchors condition 3 *after* the 2026-10-02 deploy. This read is the first since that anchor. Conditions 2 and 4 follow as amendments 2 and 3; nothing here starts Step 3.

**Object and population.** The level-basis funnel (`getLevelBasisFunnel`, `server/routes.ts:7902`, read via `/api/xstocks/filter-diagnostics` → `vtsEvaluation.levelBasisFunnel`), the cell `active:crypto_spot:active_signal_birth` — every crypto level-build ATTEMPT in the active lane (attempts, not distinct signals), over ONE process lifetime: boot `2026-11-05T14:39:52Z`, read `2026-11-06 ~15:15Z` (~24.6 h). After the 10-02 deploy and after release deploys A and B (rest-sides-to-cache). In-memory: a restart ends it.

**Rung mix.** 144,884 attempts. The book rung accepted **5,147 (3.6 %)**; it refused 139,737, of which **126,994 `no_book`** (the symbol has no book subscription — A3's cause, unchanged) and 12,743 `stale_book`. The ladder accepted **144,772 (99.92 %)**: 5,147 from the book, **139,625 from ticker sides** — `rest_poller` 134,373, `rest_adapter` 5,035, `rest_batch` 89, `ws_ticker` 128. Refused 112, all `stale_ticker`. ⇒ **condition 1's refuse-by-construction costs almost nothing in COUNT; the ladder is nearly always nameable.**

**The age of what was accepted (the new fact).** Ticker-side ages, bucket edges in seconds:

| ≤1 | 1-2 | 2-5 | 5-10 | 10-15 | 15-30 | 30-45 | 45-60 | >60 |
|---|---|---|---|---|---|---|---|---|
| 5,219 | 4,510 | 11,142 | 19,141 | 19,772 | 27,357 | 27,727 | 24,756 | 1 |

Book-side ages (5,147): 4,191 ≤1 s, 4,751 ≤5 s, 38 in 45-60 s.
⇒ **Of all 144,772 accepted builds: 25,622 (17.7 %) rest on a side ≤5 s old; 64,693 (44.7 %) ≤15 s; 52,484 (36.3 %) are older than 30 s.** ~~The near-uniform spread to 60 s is the REST poll cadence~~ **(struck: not supported by the table — density 0-15 s is 2.30× that of 15-60 s; `level-basis.ts:428` names a 2/15/30/60 s cadence. A HYPOTHESIS until the producer is cited.)**

**What an old side costs, measured.** One-minute open→close move, `crypto_spot_ohlc_1m`, bars with `interval_begin >= 2026-11-05T14:40Z`: 167,410 bars, 430 symbols — **p50 0.010 %, p90 0.263 %, p99 1.44 %** (thin symbols with flat bars pull the median down; the tail is the point). Against a crypto median spread of 0.199 % (half-spread ≈ 0.10 %), **a 60-s-old side is inside the half-spread in a typical minute and outside it in about one minute in ten.** In those minutes a level built "on the transactable side" is off by more than the error the switch-on exists to remove.

**The inconsistency it exposes.** At the exit trigger the same lane accepts a book side at most **2,000 ms** old (`active:crypto_spot:exit_trigger`, ageMax 2,000 / 1,999 ms). Under switch-on a stop would be BUILT on a side up to 60 s old and FIRED against one at most 2 s old.

**Re-justification of `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` (60 s, `level-basis.ts:719`) — my reading:** the 60-s ceiling was set for an OBSERVATION (A8) and is **not re-justifiable** for an operative level. The candidate ceilings and what each costs today:

| ceiling | builds accepted | refused vs today |
|---|---|---|
| 60 s (today) | 144,772 | — |
| 15 s | ~64,693 (44.7 %) | ~55 % of crypto level builds refused |
| 5 s | ~25,622 (17.7 %) | ~82 % refused |

⇒ **A tighter ceiling is honest and halves (or worse) crypto signal birth at the current transport.** That is an admission change of the same size class as condition 2's, and it compounds with it. **QUESTION FOR LANGSTON (the one gate of this amendment):** keep 60 s with the age stamped on every built level and stratified at Step 7, or tighten — and if tighten, does the switch-on wait for fresher sides? ~~My recommendation: tighten to 15 s, state the admission cost to Kyle before Step 6, and do not wait — a refused build is a missed trade, a stale build is a wrong stop.~~ **(struck — see the ruling below.)**

`NOT RE-READ`: the drift-vs-spread comparison (a mechanism claim about what a stale side costs) was not routed to a fresh reader; Langston is the first second pass.

### ✅ RULED 2026-11-06 (Langston, Discord `1568288118241624175`, re-derived on his own `dt-api` read at 15:33:38Z, same lifetime — not reported fact): **DO NOT TIGHTEN. 60 s STANDS, RE-JUSTIFIED FOR THE MEDIAN STOP; THE TIGHT-STOP DECILE IS THE STATED TAIL COST.**
- **The method is the batch's own (`8a-P3:91`): a ceiling sits ABOVE the healthy maximum so that a refusal means an overrun.** A ceiling refusing 55-70 % of a healthy lane is a throttle, not a freshness gate. The cost instrument is `f = (move/stop)·√(t/60)`.
- **His legs:** bid-side drift (`crypto_spot_ticker_snap`, 52,863 symbol-minutes / 406 symbols) p90 0.3727 % → ≈0.429 % at 60 s; crypto stop distance (`closed_trades`, n=699 / 180 symbols, 07-15→11-06) p10 0.762 % · p50 2.359 % · p90 7.788 %. ⇒ **f = 0.182 at the median stop** — the price `8a-P3` already accepted at 8 s for the entry fill. 60→15 s buys a factor of exactly 2.0 (√4) for 55 % of active and 70.4 % of VTS builds. **The real failure is the tight-stop decile: f = 0.563 at the p10 stop.**
- **Blockers on my §5:** (1) the constant governs TWO cells — `signal-orchestrator.ts:2730` (active) and `vts-runner.ts:1817` (VTS); costing one was incomplete. (2) No number may land as a literal: `level-basis.ts:707-718` owes the live values to the DB path (`3b.f-c`, mine), which is unbuilt.
- **Instrument corrections accepted:** OHLC open→close are trade prints, the level is built on a bid (the bid series runs 6.4× higher at p50, 1.4× at p90 — my drift leg understated); the comparator is the STOP DISTANCE, not the half-spread (A10 counts the spread once already); the funnel counts ATTEMPTS, so any refusal share is an upper bound on signal loss; book and ticker rungs must not be pooled (at 15 s the book rung retains 95.1 %, the ticker rung 43.4 %).
- **SHIP PATH (folded into the switch-on, disposition 1, no new slot):** 60 s resolved through the DB-governed path, fail hard on an empty read, named for level-build; **stamp the accepted age AND the f it implies on every built level; stratify at Step 7 by STOP DISTANCE, not age** — Step 7 either justifies a stop-relative refusal or dissolves it. Do not wait for fresher transport. Delete the unused import `active-execution-engine.ts:91` with the constant.
- **Condition 4 shrinks:** Langston can now read the funnel via `dt-api` as `dtapi`; a second-party path not dependent on that access is still owed.

---

## 6. ⭐ STEP-2 AMENDMENT 2 (CC-C, 2026-11-06) — CONDITION 2: `8c` CHANGES ADMISSION, NOT ONLY EXITS

**(a) The admission-delta estimate — stored geometry re-scored on sides.**
**Object and population.** `closed_trades`, `asset_class='crypto_spot'`, `opened_at >= 2026-10-06T15:44:53Z` (crypto epoch 7), `close_reason <> 'never_filled'`, valid long geometry (`stop < intended entry < target`): **70 records. The 8 pattern-pool records are EXCLUDED** — the pattern pool's own reward-to-risk geometry (2.5/1.5, RR 1.667) already sits below the `reverse_impulse` floor of 2.40 and is a KNOWN, homed issue (`RUNNING_ISSUES` ~`:9878-:9983`, `HOME: B-NORMALIZER-RETIRE`, CC-B, row 80a — its first objective is that pool's own RR guard); counted here it would read as an `8c` effect. **62 remain; 50 have a spread read** (nearest `crypto_spot_ticker_snap` row for the symbol within 5 minutes before `opened_at`); **49 of those clear their floor on the mid.**
**The re-score.** With full spread `sp` and entry `E`: entry on the ask, stop and target re-based on the bid (A6, P3) ⇒ risk widens and reward narrows by one spread each: `RR_side = (T − E − sp·E) / (E − S + sp·E)`, against the live `min_rr` for the strategy (`module_constants`, `expectancy_gates`, unchanged since 2026-06-27 except `vwap_*` 2026-09-20).
**Result: 18 of 49 (36.7 %) would be newly refused at the reward-to-risk floor** — `strong_bull_trend` **17 of 39 (43.6 %)**, `sma_trend_ride` 1 of 2; `morning_star` 0/5, `reverse_impulse` 0/2, `vwap_pullback` 0/1. Median spread 0.142 %, p90 0.575 % (denominator: `(ask − bid) / ((ask + bid) / 2)`, the snapshot mid).
**The mechanism, which is the finding:** `strong_bull_trend` builds stop and target as ATR multiples from one entry (`strong-bull-trend.ts:151-153`), so its RR is **2.0 by construction against a floor of 1.95** — a **2.56 % margin** (median across its records). On side-based levels it fails whenever the spread exceeds roughly **1.7 % of its stop distance**. Strategies whose RR sits well above floor (`morning_star` median +425 %) are untouched. ⇒ **the admission change is concentrated in the strategy that is 51 of the 62 non-pattern crypto admissions (82 %), and its size is set by spread ÷ stop distance, not by the spread alone.**
**Limits, stated:** (1) `intended_entry_price` is the price at promotion, not at birth, so `RR_mid` differs from the birth RR by a few percent (one `strong_bull_trend` record reads 1.909, below its floor on this measure; excluded by the mid-pass filter). (2) **The EV gate is NOT re-scored** — only the geometric floor; the EV effect is P4's reconciliation (A10: the cost model already carries `spread/2` on entry). (3) The re-base formula is my reading of P3's per-leg basis, `NOT RE-READ`. (4) Small n: 49 records over a month. **(5) THE MISSING ROWS ARE NOT RANDOM (Langston, re-derived):** 11 of the 12 records without a spread read are `strong_bull_trend`, whose nearest snapshot at any distance runs wider (median 0.2429 %); scored anyway the headline reads 24/61 = 39.3 %. ⇒ **36.7 % is a FLOOR, not a point estimate.** **(6) `sma_trend_ride` floor resolver:** it is canonical (`canonical-regime-strategy-map.ts:529`, checked at `:690`), so `getPerClassTargetGate` takes the strategy-scoped read (`expectancy.ts:262-263`), finds no crypto row, and most-specific-wins returns the class `*` row **2.0** — not `min_rr_unknown_floor` 2.88.

**(b) The floors — HOLD, stated as a choice.** The `min_rr` values were calibrated on mid-based geometry; re-scored on sides they refuse more. **I hold them**, per Langston's 09-28 condition (his 2.4g-3 ratchet: a floor only moves on a calibration read, never to absorb a re-base). The refusals are a truth reveal: those trades had less reward per unit of transactable risk than the floor requires. ~~⇒ The ~37 % (crypto) admission cut is the cost of the switch-on~~ **(struck, Langston: the measurement is a per-signal REFUSAL RATE on trades already taken, not a cut in trades — the orchestrator emits one best signal per cycle and a refused candidate can be replaced in the same cycle.)** ⇒ **The rate — roughly four in ten of last month's crypto trades would not have met the floor on real prices, how many FEWER trades that means unknown — is reported to Kyle in plain language before Step 6** (his 2026-10-19 rule: every on/off outcome is reported).

**(c) Census — who reads `dollarRiskAtStop`.** ONE writer: `active-position-sizing.ts:286` (`quantity × |entry − stop|`, stop distance from `:207`). Readers: the `[B6][SIZING]` log line (`:299`) and the returned `sizingDetails` (`:328`). **The only caller, `signal-orchestrator.ts:809`, reads `quantity` and `estimatedValue` and nothing from `sizingDetails`**; repo-wide grep for `dollarRiskAtStop|dollar_risk_at_stop|B6][SIZING` (tests excluded) finds no other reader. ⇒ **sizing is fixed-notional and the dollar risk is REPORTED, never GATED: a wider stop raises the logged risk at the same notional and changes no decision.** ⚠️ **My pattern could not reach a SECOND persisted stop-derived dollar risk (Langston):** `active-execution-engine.ts:6978` writes `riskAmount = quantity × |fill − stop|` onto the execution-attempt audit row, and `routes.ts:21507` exports `realizedPLR × riskAmount` as a dollars-per-R column. Also report-only — but it **RESCALES at the switch-on**, so the deploy boundary is labelled on that column for anyone pooling it.

## 7. STEP-2 AMENDMENT 3 (CC-C, 2026-11-06) — CONDITION 4: A SECOND-PARTY READ PATH FOR THE FUNNEL
Langston can now read the funnel himself (`dt-api` as `dtapi`, 2026-11-06), so the condition shrinks to a path that does not depend on that access. ~~**Plan item P7:** a cadenced `[LEVEL_BASIS_FUNNEL]` line in `out.log` … built with the switch-on~~ **(struck: my premise that `out.log` rotates only daily is false, and §A3 `:49` of this scope already said so — it rotates by size, 1 GB, retain 14; Langston measured the whole `out.log` history on the box at 52.8 h, the tightest inter-rotation gap 17 min ⇒ ~4 h of history when busiest.)**

### ✅ RULED 2026-11-06 (Langston, Discord `1568296158332198955`, measured on staging): **P7 = A DEDICATED FILE.** `/var/log/dawntrader/level-basis-funnel.jsonl`, append-only, one snapshot every 15 minutes (≈1.7 KB per snapshot of the four crypto cells ⇒ ~163 KB/day, ~326 KB/day with xStock lanes; no rotation rule needed for the life of `3n`). **Three requirements:** (1) **every line carries the lifetime anchor** — process start (`pm_uptime`), restart count, and the snapshot's own ISO time — because the cells are cumulative per lifetime and a second party must segment at the boundary himself (§A2: a rate within one lifetime, never a series); (2) a graceful-shutdown line is welcome but **NOT the durability mechanism** — SIGKILL/OOM skip it; the 15-minute cadence is what buys durability; (3) a `console.log` line may stay for live tailing; it is not the record. Built with the switch-on, in place before `3n` closes.

## 8. STEP-3 ENTRY CONDITIONS (CC-C, 2026-11-06)
Step 3 starts after the 2026-11-07 joint deploy, and carries in the same build window: **`#1250`, the xStock counterpart** — xStock stop and target set off the decision price rather than the price paid, on the TAKER-entry lane (Langston, Discord `1568383647483174954`), plus `entry_book_age_ms` on the `kraken_equities_ws_mid` producer. Its scope opens when carrier alert `6e8340c3` fires (2026-11-07T15:00Z). It is named here so the crypto switch-on and its xStock counterpart cannot be built on two different level-basis rules.

## 9. ⭐ STEP-2 AMENDMENT 4 (CC-C, 2026-11-07) — `8c`'s PER-LEG BASIS MEETS `#1250`'s LEVEL FORMS. ONE QUESTION BEFORE STEP 3.
**Why now.** §8 binds `8c` and `#1250` to ONE level-basis rule. `#1250` shipped 2026-11-07 (`1d4be9cf7`, Langston PROCEED, `#1250` pre-audit §7-§11) with a finding `8c` was approved without: **a level is built one of four ways** (anchor / distance / r_multiple / proportional, plus `{op, terms}` for five mixed legs), every one of the 18 xStock-member strategies now **stamps `levelSpec` at the branch that built the level**, and the strategy code is SHARED with crypto, so crypto signals carry the same stamp (`signal.metadata.levelSpec`). Measured on xStock: **198 of 246 rows were anchor stops** (a VWAP, a swing low, a range low — market prices, not offsets from the base).
**The conflict.** `8c` P3 as approved re-bases EVERY leg from the smoothed mid onto its role price — entry on the ask (taker), stop and target on the bid (A1, A6) — which is correct only for a level that is an OFFSET from the base. An anchor leg is not built from the base at all: re-basing it moves a stop the strategy placed at a market structure (the `#1250` BLOCKER-1 failure, on the crypto lane). And the §6 admission re-score (`RR_side = (T − E − sp·E) / (E − S + sp·E)`) assumed every leg moves by a spread — it is right for `strong_bull_trend` (distance/distance, 82 % of the population it measured) and over-counts for the anchor-stop strategies.
**PROPOSAL — the same rule as `#1250`, applied at BIRTH instead of at the fill:**
- the ENTRY takes its role price (ask for a taker entry, the limit for a resting maker — the role the `chosenEntryMode` decides);
- each stop/target leg is re-derived by its stamped FORM from the base it was built on (the smoothed mid) onto its role price (the bid): **anchor ⇒ unchanged; distance ⇒ shifted by (bid − mid); proportional ⇒ scaled by bid/mid; r_multiple ⇒ R kept against the carried stop; mixed ⇒ each term re-derived and the operator re-applied** — `rebaseLevels` already implements exactly this with `planEntry = mid-basis`, `fill = role price`;
- absent stamp ⇒ anchor ⇒ no change (as `#1250`); **no transactable basis ⇒ the signal is REFUSED (condition 1 unchanged — no mid fallback)**;
- §6's admission re-score is re-run with the per-form re-base before the Kyle report (the 36.7 % floor was computed on "every leg moves"; it will fall on the anchor-stop strategies and stand on `strong_bull_trend`).
**THE ONE QUESTION (one gate):** is the per-form re-base above `8c`'s rule — so `#1250` (fill) and `8c` (birth) are the SAME transform at two moments — or does `8c` keep "every leg onto the bid" because the trigger now reads the bid (`8a-P2`/`8a-P3`) and the A6 asymmetry argument applies to anchors too?

### ✅ RULED 2026-11-07 (Langston, Discord `1568738862887473254`, re-read at `64d4eb3cf`) — PER-FORM IS `8c`'s RULE; PROCEED TO STEP 3 WITH ITEMS 2-4 BUILT IN. Recorded here as he required ("a gate answered only in-channel is one I will re-decide differently when I'm stateless").
1. **Per-form, for a different reason than mine:** with `8a` shipped the requirement is SCALE COHERENCE between the trigger and the level. A `distance` leg is an ATR quantity — a statement about market movement — so it is expressed on the scale the trigger reads: `L + (bid − mid)`. An ANCHOR never referenced the base, so no transform is derivable from the stamp; `bid − mid` applied to it would be a new offset the strategy never chose. ⛔ **He may not assume the anchor series is mid-scale:** every live anchor stop is a low off the Kraken OHLC series (`ohlc-cache.ts:103` → `getOHLCData`) — TRADE PRINTS, neither mid nor bid. ⇒ **unchanged is the default under an UNMEASURED basis, not a proven correction**; the owed measurement (the anchor series' side against the contemporaneous book) goes on the telemetry rung, NOT in front of Step 3.
2. **R goes against the ENTRY ROLE PRICE (the ask), not the bid.** Every live `r_multiple` is `entryPrice + (entryPrice − stopPrice)·r` (`strategy-engine.ts:250-251`, `:259-260`, `:403-404`, `:547-548`, `:981-982`) — a ratio over OUR geometry. With `fill = bid` the target lands `sp·(1+r)` low (0.426 on a $100 instrument at the median spread, 1.725 at p90) and realised R goes 2.000 → 1.801 (−10 %) against a floor whose median margin is 2.56 %.
3. **⛔ "`rebaseLevels` already implements exactly this" was FALSE — one `fill` did two jobs.** ⇒ **add `entryBasis` beside the level basis**: `r_multiple` and the long-ness assertion read `entryBasis`; `distance`/`proportional` read the level basis; `#1250` passes the same value for both and becomes the degenerate case. ONE transform at two moments; **no second function.** Related: with `fill = bid`, `stop < fill && target > fill` would admit a target INSIDE the spread — the long-ness assertion reads `entryBasis` (the ask).
4. **⛔ "Absent stamp ⇒ anchor" is NOT fail-safe at BIRTH, and the path is live.** At birth an unchanged leg stays on the smoothed mid — the fallback condition 1 forbids. Measured: `server/strategies/defensive-hedge.ts` carries NO `levelSpec` and emits `stopPrice` `:240` / `targetPrice` `:241` = `entryPrice ± mult·ATR` — distance legs — and is canonical and crypto-live (`canonical-regime-strategy-map.ts:231`/`:510`; excluded from xStock at `:430-431`, which is why `#1250` never needed it). ⇒ **stamp it, and an absent or malformed stamp on a level-bearing leg is a REFUSAL at the crypto birth site** (the xStock fill arm keeps its anchor fail-safe).
5. **Pre-register the §6 re-run's predictions before re-scoring** — §10 below.
**Disposition: all five fold into the switch-on, no new slot. Kyle still gets only §6(b) in plain language before Step 6.**

## 10. ⛔ PRE-REGISTERED 2026-11-07, BEFORE THE §6 RE-RUN — the per-form admission re-score
**Method:** §6(a)'s population and spread read, unchanged (crypto epoch 7, 62 non-pattern records, 50 with a spread read, 49 passing on the mid). Per record, re-base by the stamped form of the strategy branch that built it: entry → ask (`E·(1 + sp/2)`); anchor legs unchanged; distance legs `− (sp/2)·E` (onto the bid); proportional legs × `bid/mid`; `r_multiple` targets `ask + r·(ask − stop')`. Re-score against the live `min_rr`.
**Predictions (Langston's, adopted):** **(a)** the headline barely moves — `strong_bull_trend` is distance/distance and 82 % of the population, so its 17 of 39 stands; the per-form credit lands on `sma_trend_ride`'s 1 of 2 ⇒ ≈ **17/49 = 34.7 %**. **(b)** an `r_multiple` target's RR is INVARIANT under the switch-on once R is anchored at the entry — `vwap_pullback`'s override branch re-scores to exactly its stamped r.
**FAIL of the method:** if (a) lands far from 34.7 % for a reason other than `strong_bull_trend`, or (b) is not exact, the FORMULA is wrong, not the data. §6 limit (5) carries: the result is a FLOOR (11 of the 12 records without a spread read are `strong_bull_trend`).


### §10-RESULT (CC-C, 2026-11-07T22:16Z) — the per-form re-score, against the predictions written above
**Instrument:** `scripts/analysis/b_price_side_8c_rescore.sql` + `.py` (committed with this result; re-run on staging as written in the script header).
**Population — PREVIOUSLY STATED: 70 records / 62 non-pattern / 50 with a spread read / 49 passing on the mid (§6(a), read 2026-11-06). NOW: 71 / 63 / 51 / 50 on the same window (opened before 2026-11-06T10Z, the latest record before §6's read; the next opened 2026-11-07T11Z). REASON: one more `strong_bull_trend` record appears in the window on re-read; the query is unchanged, so the table is not frozen (rows are written at open; this one was not visible at §6's read).** The full table to now is 73 / 65 / 53 / 52.
| strategy | form | mid-pass | newly refused, **per-form** | newly refused, every-leg (§6) |
|---|---|---|---|---|
| `strong_bull_trend` | distance / distance | 40 | **18** | 18 |
| `morning_star` | anchor / distance | 5 | 0 | 0 |
| `reverse_impulse` | anchor / distance | 2 | 0 | 0 |
| `sma_trend_ride` | anchor / proportional or r_multiple | 2 | **0** | 1 |
| `vwap_pullback` | anchor / max(anchor, r_multiple) | 1 | 0 | 0 |
| **all** | | **50** | **18 (36.0 %)** | 19 (38.0 %) |
**(a) — PASS on the method.** The headline barely moves and for the predicted reason: `strong_bull_trend` stands (it is distance/distance, where per-form and every-leg are the same formula), and the per-form credit lands on `sma_trend_ride`'s 1 of 2, exactly as predicted. The number differs from the predicted 17/49 = 34.7 % by the one extra `strong_bull_trend` record above (refused under both rules), not by any other cause. To now (52 mid-pass): 19 per-form, 20 every-leg.
**(b) — NOT EXERCISED BY THIS POPULATION; holds by construction.** No record matches an `r_multiple` branch's R exactly: the two `sma_trend_ride` records read 2.4978 and 2.4861 against `break_target_r_multiple` 2.5, because `intended_entry_price` is the promotion price, not the birth price (§6 limit 1) — so they could be either branch, and BOTH branches pass on them. The one `vwap_pullback` record (3.3883) is the default branch with the anchor term winning. The invariance itself is the arithmetic of `rebaseLevels` at `entryBasis` = the ask, fenced exactly in `b8c-birth-levels.test.ts` (§10 (b)).
**What it means for Kyle's §6(b) report:** about four in ten of last month's crypto trades (18 of 50) had less reward per unit of real-price risk than their floor requires; nearly all of them are `strong_bull_trend`, whose reward-to-risk sits 2.56 % above its floor by construction. Still a per-signal refusal rate on trades already taken, not a count of fewer trades (§6(b)).

## 11. STEP-2 AMENDMENT 5 (CC-C, 2026-11-07, found in Step 3) — P4 IS SEVEN SITES, NOT ONE; AND THE HYBRID RE-ENTRY. ONE QUESTION.
**Why.** P4 says the spread is counted once "across level construction and the cost model". The census at `c3ec81851` (repo-wide, tests excluded: every caller of `computeTotalRoundTripCost`, `computeNetGeometry`, `decideMakerTaker`, `evaluateTradeExpectancy`, `computeFillEconomics`) finds **seven sites that judge a crypto active signal's own levels and charge the spread on them**, not the one (`decideMakerTaker`) the plan named:

| # | site | what it decides |
|---|---|---|
| S1 | `signal-orchestrator.ts:1065` `decideMakerTaker` (`'mid'`) | maker or taker at birth + its Net-EV gate |
| S2 | `signal-orchestrator.ts:1959` `computeNetGeometry` (+ `:1965`) | `netExpectedEdge` / `netRewardToRisk` on the sized signal |
| S3 | `signal-orchestrator.ts:3347` [HF9] NetEV > 0 filter | drops a sized signal before the RTB |
| S4 | `ready_to_buy_service.ts:699` `computeNetGeometry` + `:734` `decideMakerTaker` (`'mid'`) | the RTB refresh re-decision |
| S5 | `ready_to_buy_service.ts:1769` `evaluateTradeExpectancy` | the ranker's net R |
| S6 | `active-execution-engine.ts:5994` `evaluateTradeExpectancy` | the open-gate EV |
| S7 | `fill-economics.ts:99` `decideMakerTaker` (`'mid'`), called at `active-execution-engine.ts:6394`/`:6503`/`:6505` | the fill economics |

The rest (`tec-costs.ts`, `routes.ts`, `cost-telemetry.ts`, `cost-drift-monitor.ts`) report costs and judge no signal's levels — unchanged, as `composeSidedFriction`'s docblock requires. **Flipping S1 alone leaves S2-S7 charging the spread a second time on sided levels:** every later gate would refuse more than the truth, and S4/S7 would re-decide maker vs taker on a double-charged taker arm.
**PROPOSAL.** (i) At crypto birth, after the per-form re-base, stamp `metadata.levelGeometry = 'sided'` beside `levelSpec` and the basis/age record. (ii) ONE reader, `levelGeometryOf(metadata)`: `'sided'` only on that exact stamp, otherwise `'mid'` — xStock, VTS and pre-deploy RTB rows keep today's arithmetic. (iii) S1-S7 take their geometry from that reader: `decideMakerTaker` already has the switch; `computeNetGeometry` and `evaluateTradeExpectancy` gain a REQUIRED `levelGeometry` argument (no default — the refuse-never-default discipline of `maker-taker-decision.ts:122-131`), where `'sided'` drops the `spread/2` entry term and charges `composeSidedFriction`; S3 likewise. (iv) **Condition 1 at the far end:** a `crypto_spot` signal reaching the open gate without the stamp is REFUSED (`LEVEL_GEOMETRY_ABSENT`), so a hop that drops metadata cannot quietly turn a sided signal back into a mid-priced one; RTB rows queued before the deploy are refused for the minutes they live — the fail-closed direction. (v) A hop fence like `#1250` P0: the stamp survives strategy → sized signal → RTB → open.
**THE HYBRID RE-ENTRY (same read; folds in).** A HYBRID copies an already-sized quant signal (`hybrid-integration.ts:182` `...q`) and is sized AGAIN (`signal-orchestrator.ts:3315`) with its metadata REPLACED (`:3296-3311`), so it loses `levelSpec`. Under ruling item 4 it would be refused at crypto birth; carrying the stamp alone would re-base its distance legs a SECOND time. ⇒ **the birth re-base is idempotent on the `levelGeometry` stamp (already sided ⇒ no transform, no refusal), and the hybrid's metadata carries the quant signal's `levelSpec` + `levelGeometry` forward.** HYBRID signals are being built today (`[11.8C][VTS] … signalType=HYBRID` lines in `out.log`, 2026-11-07).
**THE ONE QUESTION (one gate):** are S1-S7 with the stamp-carried geometry and the open-gate refusal the P4 reconciliation — or do you want S2/S3 (the logged net geometry and the HF9 pre-filter) left on `'mid'`, accepting a double charge there?

### ✅ RULED 2026-11-07T22:24Z (Langston, Discord `1568752916016144455`, re-read at `1396d9c37`) — S1-S7, ALL SEVEN; PROCEED TO WIRE P4 ON THREE CONDITIONS
He rejected the S2/S3 option outright: **S3 is a hard drop** (`signals.filter` → `return false`, a double-charged sided signal deleted at birth), and **S2 is carried, not logged** (`netExpectedEdge`/`netRewardToRisk` stamped onto the sized signal and the RTB row, read at `ready_to_buy_service.ts:679`, `:1151` and `amr-context-bonus-shadow.ts:252`). S1's sided arm has never executed in production (every live caller passed `'mid'`), so `#661` leg 3 applies to the whole sided path.
**C-1 — the VTS lane (census §9 W-1). DISCHARGED by read site:** the VTS builds its OWN signals — `callStrategyDetect` (`vts-runner.ts:1908`) straight into the strategy detectors; its levels are `strategySignal.entryPrice`/`.stopPrice` (`:1917-1918`) and its normalised target (`:2016`); it never calls `buildSizedSignalForStrategy`, so it cannot receive orchestrator-born sided levels. Its `[11.8C][VTS] … signalType=HYBRID` lines are its own hybrid buffer (`vts-runner.ts:72`). ⇒ W-1 is about a FUTURE sided VTS; `vts-runner.ts:2170` stays `'mid'` correctly. **Correction to §11:** whether the ACTIVE orchestrator's hybrid path fires is NOT established — the `[10.5] HybridIntegration` lines (6 in the ~2 h retained `out.log`, all ICNT/USD) do not name their lane. The 8c handling stands either way (idempotent re-base + carried stamps).
**C-2 — the mid arm of `computeNetGeometry`. A DEFECT against its own directive, recorded and NOT fixed here:** Directive 11.3A (`089ac1bfd`, 2026-01-08; spec `attached_assets/Pasted-Directive-11-3A-…_1767901151039.txt:92`) states *"Subtracts total cost once (no double-counting)"*; the code walks the entry by `slippage + spread/2` and subtracts the full round trip from a gross measured off that walked entry — slippage 3×, spread 1.5×. Filed `#1252`, surfaced for Kyle (moves every historic netEdge series). **The SIDED arm charges each cost once:** entry = the ask walked by the ENTRY slippage only; then `2·fee + 1·slip` — the same composition fill economics uses at the fill. Fenced.
**C-3 — the refusal population and the stale docblock.** Docblock fixed (`maker-taker-decision.ts`, the three-constructors line: `#929` CLOSED, `#928`'s intent limb deleted, only `#927` on the promotion path, losing a target not the stamp — re-derived at the ref). **Measured, replacing the adjective:** `rtb_signals` sampled 12× over 3 min (2026-11-07T22:28:56Z-22:31:44Z): **0 rows, 0 inserts** (insert counter flat at 154,025 — the table is a transient working queue, inserts = deletes); so at this read the open refusal's pre-deploy population is **0**. The same read is taken immediately before the deploy and recorded at Step 6.
**Hybrid:** the drop is already recorded at `signal-orchestrator.ts:598-600` at the ref (`:689` on this branch — the C-2 `_isCap` comment, *"a HYBRID rebuild drops the strategy's metadata"*). With the carried stamp the cap bit reads from the stamp; only `volatility_edge` stamps `targetIsCap: true` (repo-wide census: one file), and a hybrid's strategy is its quant source's, so stamp and name agree — no rounding change. Re-rounding an already-rounded sided triple is a no-op.
**Hop fence, one hop further (his ask):** strategy → sized → hybrid rebuild (`pickLevelStamps`) → RTB write → jsonb round trip → promotion's `...signal.metadata` → reads sided with its maker bid, and the hybrid re-size is a no-op on prices. Fenced in `b8c-switch-on-wiring`.
**Board:** he sets `Review = Approved` once C-1 lands.

## 12. STEP-2 AMENDMENT 6 (CC-C, 2026-11-07, from the Step-3 fresh reader, re-derived at the ref) — THE FLOOR §6 COUNTED DOES NOT REFUSE AT THE QUEUE. ONE QUESTION.
**The mechanism, re-derived at `origin/migration/aws-supabase`:** in `buildSizedSignalForStrategy` the signal is written to the RTB (`readyToBuyService.queueSQESignal`, `signal-orchestrator.ts:1511` at the ref) BEFORE the reorg-B2 target gate (`normalizeAndGateTarget`, `:1933`); nothing returns between them, and `queueSQESignal` is the only writer the open reads. Its `return null` on `rr_below_min` therefore drops only the sized signal handed back to the paper callback, which only logs. **It has been in that order since the gate was added** (`d592c8e29`, 2026-06-20: queue `:787`, gate `:1204`). The two other floor reads are shadows (`ready_to_buy_service.ts:1317`, `active-execution-engine.ts:6405`). ⇒ **On the crypto active path the reward-to-risk floor refuses only inside the strategy (`applyGlobalGuards`, per its gate disposition), on the MID geometry, before the 8c re-base.** Live control: the pattern pool's 1.667 against a 2.40 floor opened (§6(a)) — read there as "the pool has no guard of its own" (row 80a); the post-strategy gate that would have caught it never gates.
**Not a new issue (§9.5(b-ii)):** an annotation on `#373` (the normalizer is the "downstream double-gate" B-NORMALIZER-RETIRE retires, row 80a, CC-B): on the paper active path it was never a gate.
**What it does to 8c:** §6 counted 18 of 50 (§10-RESULT) that "would be newly refused at the floor". After the switch-on nothing re-checks the floor against the sided triple, so those signals are NOT refused — they reach the queue with a sided reward-to-risk below their floor, and only the EV gates (now charging the spread once) stand in front of them. §6(b)'s report to Kyle ("would not have met the floor") describes a refusal that will not happen.
**THE ONE QUESTION (one gate):** fold into 8c (disposition 1 — the switch-on depends on it) a floor check of the SIDED triple at the birth seam — `rr = (target − ask)/(ask − stop) < getPerClassTargetGate(class, strategy).minRR` ⇒ refuse, `level_rr_below_min_sided` — so the floor (HELD, 09-28 condition 2) judges the levels that trade; or leave the floor where it is (row 80a owns the ordering), switch on with those trades opening at a lower R, and tell Kyle that instead? **My recommendation: fold it** — 09-28 condition 2 held the floors on the premise that they refuse; without a sided re-check the hold is nominal.

### ✅ RULED 2026-11-07T22:49Z (Langston, re-derived at `382c1793f`) — FOLD IT IN, NOT AS WRITTEN. Mechanism confirmed (queue `:1511` fire-and-forget; gate `:1930` → `return null :1952`; zero returns between, 14 before; `queueSQESignal` the single live RTB writer; both other floor reads shadows; the in-strategy guard defaults `'enforce'`, `strategy-helpers.ts:446/449`). Five items, and the responses:
1. **WHERE 8c re-bases — cited, not asserted:** NOT inside the strategies. The strategy builds on the mid and runs its own `applyGlobalGuards` (e.g. `morning-star.ts:168`/`:179`); the 8c transform runs afterwards at ONE seam, `buildSizedSignalForStrategy` (the `ROW 8c (SWITCH-ON)` block, after `recordActiveSignalsGenerated` and before the F-G-1 grid), via `baseCryptoLevelsAtBirth` → `rebaseLevels` — amendment 4's ruled design (`#1250`'s transform at birth), not a `priceForLevelRole` wire-in per strategy. ⇒ the in-strategy floor judges the MID triple; nothing judged the sided one. Readable at the Step-4 ref (this push).
2. **The entry is the ARM's role price from the build basis — taken.** `sidedRewardToRisk(metadata, stop, target, arm)` reads `priceForLevelRole(basisOf(levelBasisAtBirth), arm === 'maker' ? 'entry_maker_resting' : 'entry_taker')` — the SAME basis, no fresh read. The arm is `_mtPolicyDecision.chosenMode`; the check sits after it and BEFORE `queueSQESignal`. Refusals (pre-SQE, counted): `level_rr_below_min_sided`, `level_rr_floor_unresolved`, `level_geometry_stamp_malformed`. And the birth re-base itself now reads every price through `priceForLevelRole` (levels at `'stop'`, entry at `'entry_taker'`, maker at `'entry_maker_resting'`); the build record carries the quote's capture instant so it IS a `LevelBasis`.
3. **The LIFT half — recorded on `#373` (row 80a), not fixed here:** the payload carries `rawSignal.targetPrice`, never `_b2.targetPrice`, with no throw on an absent target.
4. **Blast radius — scoped to `crypto_spot`.** The check is `sizingContext.assetClass === 'crypto_spot' && _mtGeometry === 'sided'`. The xStock active leg has the same hole (its eval-cycle normaliser only TAGS, `vtsGateVerdict` is never read before `dispatchXstockActiveSignal`); recorded on `#373` for row 80a.
5. **The control, with the rows:** all 8 crypto pattern-pool closes in epoch 7 (`source_pool='pattern'`) read RR 1.663-1.670 at BOTH the intended entry and the fill (e.g. `e88e46bc` reverse_impulse 0.45059/0.43453/0.47736 → 1.6669 at intent and fill, floor 2.40). So it is MID RR: those rows never met a strategy guard (the pool builds via `patternToTradeSignal`, 1.5/2.5 ATR, no guard — row 80a's first objective), AND the post-strategy floor — the only floor the pool's path meets — did not refuse them. Both defects are real; the control evidences the second only because the pool has no other floor.

## 13. THE SWITCH-ON (CC-C, 2026-11-08) — 8c ships behind `level_basis.crypto_birth_sided_enabled`, seeded 0
**Why:** 8c's code sat under OLD Claude's `B-DB-POOL-GUARD` P5 deploy range, and 8c's switch-on waits on Kyle's §6(b) report. A default-off switch lets one deploy carry 8c without changing crypto trading.
### ✅ RULED 2026-11-08T00:33Z (Langston, Discord `1568785586045591574`, enumeration re-derived at `17451a3ca`) — YES, FOUR CONDITIONS
He rules it himself (OFF is byte-equivalent to today, moves no risk and no authority; Kyle's §6(b) report still gates the FLIP). Responses:
- **(a) An absent or unparseable row REFUSES at boot, never infers OFF.** `readSidedSwitch` reads the row through `getCachedNumberRequired` (missing ⇒ throws) and throws on anything but 0/1; `assertLevelBuildKnobsAtBoot` fails the boot. Fenced (`b8c-switch`).
- **(b) The flip binds at BIRTH; every later job keys on the row's OWN stamp.** The switch is read in ONE place — the birth seam, once per built signal — and every crypto signal is stamped with the geometry it was built on: `'sided'` (ON) or `'mid'` (OFF; a row already carrying a stamp, a HYBRID, keeps its own). The four cost sites and the §12 floor read `levelGeometryOf` (the stamp); **the open refusal keys on the STAMP too — refused only when a crypto row carries neither, i.e. it lost its metadata on a hop or was queued before 8c deployed — and never reads the live switch.** So a row born under one setting keeps it for life. Fenced: the orchestrator holds exactly one `.sidedEnabled` read; the engine holds none.
  ⚠️ **What this costs at the inert deploy, stated:** a crypto RTB row queued BEFORE the deploy carries no stamp and is refused at the open for the minutes it lives. Measured 0 rows / 0 inserts over 3 min at 22:28-22:31Z; re-read immediately before the deploy and recorded at Step 6.
- **(c) The flip takes effect WITHOUT a restart:** `level_basis` is in `PREFETCH_MODULES`, and the module cache re-warms every 60 s (`module-constants-service.ts` `CACHE_TTL_MS = 60_000`, background refresher) — a flip is live within ~60 s. Boot asserts the row exists; it does not pin the value.
- **(d) The OFF branch's removal, named now:** `8c-OFF-REMOVAL`, an item of row `8c` (disposition 1, no new slot), placed **after the switch-on has held through 8c's Step-7/8 window**: delete the switch, the `'mid'` birth stamp branch, and the `'mid'` arms the switch kept alive on the crypto path only (`computeNetGeometry` / `evaluateTradeExpectancy` / `decideMakerTaker` / `computeFillEconomics` keep `'mid'` for xStock and VTS, which are not sided). Recorded in `DELETED_COMPONENTS_LOG.md` when done.
- **(3) What the inert deploy buys: NOTHING observational.** OFF writes `'mid'`, never `'sided'`, so it proves the code deploys and boots, full stop. **The switch-on is the first live exercise of the birth re-base, the walk record, the refusals and the §12 floor; nobody may cite the inert period as evidence any of them work** (`#661` leg 3).
- **HYBRID comment (`signal-orchestrator.ts` `_isCap`):** stale since 8c — the HYBRID literal now carries `levelSpec` via `pickLevelStamps`; corrected in place, and the name fallback kept as the defence for a future unstamped constructor (none at this ref, per the enumeration).
- **Surfaced, folded (his §13 disposition 1):** the `levelSpec` stamp is now the SEVENTH strategy wire-in point — `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 6.1 and `R-STRATEGY6` updated in the switch commit.
