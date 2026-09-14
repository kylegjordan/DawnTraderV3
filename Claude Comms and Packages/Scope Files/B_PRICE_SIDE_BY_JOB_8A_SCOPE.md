# `B-PRICE-SIDE-BY-JOB` ROW `8a` — MOVE THE EXIT TRIGGER OFF THE MIDPOINT

**Batch:** `B-PRICE-SIDE-BY-JOB` (`3n`) · **Row:** `8a` · **Owner:** CC-C · **change-class: architecture**
**r4, 2026-09-14 — r3's five blockers stand; r4 carries Langston's two §4 corrections and his §5 BLOCKER, re-derived at the object before accepting.**
**KYLE-AUTHORISED: *"Make the change — move the trigger to the bid."***

> ⛔ **THE DECISION IS NOT RE-LITIGATED AND LANGSTON DID NOT ASK FOR IT TO BE.** *"A stop that holds only when the midpoint agrees is not a stop."* **Every change below is to the INSTRUMENT.**

---

## 0. r1 → r2 — WHAT WAS WRONG, AND IT WAS ALL ONE CLASS

⛔⛔ **EVERY BLOCKER IS THE SAME FAILURE: I ARGUED FROM A POPULATION OR A CENSUS I HAD NOT MEASURED ON THE EXIT PATH** — inside a scope that cites §9.5(a) and whose own case rests on those numbers.

| # | r1 said | AT THE OBJECT |
|---|---|---|
| **B1** | the ladder recovers **99.94%**, so refusing is rare | ⛔ **that is LEVEL BUILDS across the scanner universe.** `selectTouchPrice` has **exactly two production callers — `signal-orchestrator.ts:2657`, `vts-runner.ts:1588` — and ZERO in the engine.** **The ladder's refusal rate on the EXIT population is UNMEASURED**, and it is the number my fail-closed argument rests on. |
| **B2** | OBJ-4 compares refusal rate "against the pre-deploy rate on the same counter" | ⛔ **WRONG-OBJECT.** The existing skip is `_priceSkipStreak`/`_priceSkipReasons` (`aee:1774`), keyed on **venue mark availability**. Ladder refusal is a different predicate **nothing has ever evaluated there.** There is no pre-deploy value. |
| **B3** | *(silent on the age ceiling)* | ⛔ **`selectTouchPrice` applies ONE `maxAgeMs` to both rungs, wired to `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS = 60_000` — sized for an OBSERVATION shadow, and this row makes it LOAD-BEARING ON A STOP.** ★ **And it is FOUR TIMES LOOSER than the existing `active_fill_max_age_ms = 15_000`** ⇒ **a quote the staleness gate REFUSED would be resurrected by the ladder and yield a trigger price.** |
| **B4** | after the switch "the ARMS SWAP" | ⛔ **FALSE.** The shadow's bid arm is `fg2BookBid`, the **RAW BOOK TOP** (`aee:2268`, 0.089% coverage); the live arm becomes the **LADDER**. **Different instruments — they DIVERGE, they do not swap.** And `B_PRICE_SIDE_BY_JOB_PRE_AUDIT.md:558` P-8a says the shadow is **REMOVED**. |
| **B5** | `currentPrice` has **4** consumers | ⛔ **IT HAS 24 IN THE LOOP** (`:1880`-`:2330`, counted). r1 missed `:1892` the trace stage, `:1897-1905` the unrealized-P&L **and its DB write to `active_open_positions.currentPrice`/`unrealizedPnl` — the UI-VISIBLE MARK**, `:1927` `lastExitChecks`, `:2111-2124` the distance math + `EXIT_EVAL`, and `:2308`/`:2319` the shadow's own `mid:` field. |

---

## 1. THE RULE *(unchanged from r1)*

A long is closed by **SELLING**, and a sell transacts on the **BID**. *"Has this reached its stop?"* must be asked of the price we could actually sell at.
⛔ **The error is a FULL SPREAD, not half** — entry buys the ask, stop and target sell the bid, opposite by construction.

## 2. THE EVIDENCE *(unchanged from r1, and it is exit-lane data)*

41 closed crypto trades carrying the `F-G-2` shadow since 2026-09-02: **34 stop/stop/stop · 5 target/target/target · 2 bid-STOP vs mid-TARGET.** **39 of 41 identical.**
The 2 discordant, measured: `TRIA/USD` stop 0.004930 — **bid 0.004920 BELOW**, mid 0.004935 above. `UNI/EUR` stop 5.021600 — **bid 5.012100 BELOW**, mid 5.025000 above. **Both ran on to target.** ⇒ **the mid did not enforce the stop and was rescued.**
⚠️ **COST, STATED: ~$9.06 of realised profit given up across the 41** (total net −$108.95; 7 targets, 34 stops). ⛔ **THIS ROW DOES NOT CLAIM A P&L IMPROVEMENT. It is a risk-control correction and must be judged as one.**
⚠️ `UNI/EUR` is non-USD-quoted (`#966`/D9); its dollar figure carries a conversion error. Direction unaffected.

---

## 3. ⭐⭐ SHADOW FIRST, FLIP SECOND — **B1 + B2's DISCHARGE, AND IT IS NOW THE SHAPE OF THE ROW**

**`8a` SPLITS INTO TWO SHIPS.**

### `8a-P1` — THE EXIT-LANE LADDER SHADOW *(no behaviour change)*
Call `selectTouchPrice` **in the exit loop**, record **per rung** (`book` / `ladder`, accepted vs each refusal reason, keyed by lane × class exactly as `8c`'s funnel is), and **act on nothing.** `currentPrice` continues to drive every consumer.
⇒ **This produces the ONE number the whole fail-closed argument needs and does not have: the ladder's refusal rate ON THE EXIT POPULATION.**
★ **It is the discipline `F-G-2` OBJ-0 itself used, and Langston's own words: it costs a day against an exposure that is otherwise unbounded until OBJ-4 reads.**

### `8a-P2` — THE FLIP
Ships only after P1's window, and **only if P1's measured refusal rate clears the threshold pre-registered in §7 BEFORE the window opens.**

---

## 4. THE SOURCE, AND ⛔ THE AGE CEILING THAT GOVERNS IT **(B3)**

**Source: the D3 ladder `selectTouchPrice` — valid fresh book top → valid ticker sides → REFUSE.** Not the raw book bid: the trading socket carries a book for **ONE** symbol (`venueTimestampPresence.book.distinctSymbols = 1`, and the adapter's `- Subscribed Symbols: 1` — two independent instruments), so gating the live trigger on it would **stop exits for everything else**, a fail-closed on the risk-control path.

⛔⛔ **r2's CLAMP IS WITHDRAWN — IT HAD NO REFERENT ON THE LANE IT MUST BIND (Langston BLOCKER-1, r3).** It read *"≤ the mark-staleness ceiling already governing that path."* **THERE IS NO SUCH CEILING ON THE CRYPTO EXIT PATH.** Re-derived at the object: `mark-staleness.ts` lives at `server/asset_classes/xstock_spot/`, the engine reaches it only inside `aee:1356` `if (_posClass === 'xstock_spot')`, and `:1354` says it outright — *"The crypto venue chain below is untouched (additive, class-keyed)."* **Row `8a` is the crypto lane by its own P2-OBJ-3.**
⇒ ⚠️ **AND THE TWO NUMBERS I JUSTIFIED IT WITH WERE A THIRD AND FOURTH OBJECT: `active_fill_max_age_ms` is `xstock_fill_safety`, the xStock ENTRY-FILL gate (`active-dispatch.ts:180-186`) — my own plan row `3b.f-c` says so. So the "4× inversion" compared an xStock ENTRY constant against a crypto/VTS LEVEL-SHADOW constant, and the clamp bound to neither.** ★ **Where the clamp DOES resolve (xStock) the band is `floor_ms 15000 → cap_ms 300000`, which admits 60,000 comfortably — vacuous at the cap end on the only lane that can evaluate it.**
⛔ **THIRD INSTANCE OF §0'S OWN CLASS, INSIDE THE FIX MEANT TO CLOSE IT.**

✅ **r3 — AN ABSOLUTE, CLASS-KEYED, DB-GOVERNED CONSTANT WITH ITS OWN NAME. No relational form, because no live referent exists on this lane.**

| | |
|---|---|
| **name** | `exit_ladder_max_age_ms`, module `crypto_spot` — **its own constant, not a reuse** |
| **value** | ⛔⛔ **DERIVED FROM A RISK STATEMENT INDEPENDENT OF THE OBSERVED AGES — tolerable adverse movement over the interval, against stop distance. NOT a quantile of P1's own age distribution (Langston r4 correction 1).** ★ **A ceiling set from the distribution it filters IS the refusal rate: whoever picks it picks the number, so §7's P2 gate would be satisfied BY CONSTRUCTION and would test nothing — the `B-GEOMETRY-REACH-BASELINE` shape, where `atrsToTarget` **is** `target_exit_atr_multiplier`, one knob wearing two names.** ⇒ P1's distribution then **MEASURES** the refusal rate at that value, so the gate can fail. |
| **⛔ NOT** | `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` (60,000 — an OBSERVATION-shadow constant) · `active_fill_max_age_ms` (xStock ENTRY) · the xStock risk-derived exit ceiling (different lane, different derivation) |
| **fail direction** | ⛔ **SPLIT, because one rule was the wrong shape for two objects (Langston r4 correction 2).** A **PRICE** that does not qualify ⇒ refuse that trigger, **this tick**. A **CONFIG READ** that does not resolve ⇒ **NOT a silent per-tick refusal** — that refuses every exit check on the lane indefinitely, leaving every open crypto position unguarded rather than one tick unpriced. It takes its **own reason code** and raises a **breakage alert on first occurrence**. ★ **The precedent is already ours: `aee:1385` `equity_age_knob_missing`.** Never widen, in either arm. |

## 5. ⛔⛔ ON REFUSAL: SKIP, NEVER FABRICATE — AND WHAT P2 IS THE **FIRST** OF

No fallback to the midpoint: that would reinstate the defect precisely where it matters most. The refusal carries its reason and its own counter.

⛔⛔ **r3's ★★ AND ITS 🟨 FINDING ARE WITHDRAWN — FALSE AT THE OBJECT, AND MY OWN LEDGER ALREADY SAID SO (Langston BLOCKER, r4).** r3 claimed *"a crypto stop/target can today be evaluated against an arbitrarily old mark, and nothing refuses it."* **THE CRYPTO MARK IS AGE-BOUNDED TODAY, STRUCTURALLY, AT 2,000 ms** — and `RUNNING_ISSUES.md:7278` records that mechanism verbatim: *"flat 2,000 ms, hardcoded … + the `isKrakenVenueSource` actionability gate."*
⛔ **I FILED A FINDING MY OWN LEDGER REFUTES.** The §9.5(b-ii) search is the check that runs **before** something becomes a finding, and it returns this on the first grep. *(That row cites `aee.ts:1431`; the call is now `:1652` — mechanism right, line stale.)*

**THE MECHANISM, RE-DERIVED AT `6b9155e9e`:** `aee:1652` `getPriceWithFallback(symbol, 2000)` → `live-pricing-adapter.ts:1332` serves a cached entry only when `age <= WS_CACHE_FRESH_MS` **AND** `isKrakenVenueSource` → else it REST-fetches → else it re-serves under `source: 'last_known_good'` (`:1404`), which **fails** the venue predicate at `aee:1672` and routes to the direct REST leg, which **skips the tick** on failure. ⇒ **No route puts an arbitrarily old mark into `evaluateTECExit` on crypto.**

⇒ ★★ **THE TRUE STATEMENT IS ABOUT A DIFFERENT OBJECT: the MARK is bounded; the LADDER SOURCE has no age gate on this lane — because it has no consumer on this lane at all.** ⇒ **P2 is the first age-based refusal ON THE LADDER SOURCE, not on the lane.** §4 stands unchanged: there is still no live referent for a relational clamp.
⚠️ **WHAT DOES NOT SURVIVE IS READING AN AVAILABILITY-LABELLED SKIP AS PROOF OF NO AGE TEST.** The age test lives in the **adapter**; the engine's reason code names only the **last step** — so an age-conditioned refusal wears an availability label. **That is this batch's own adjacent-object class, one layer down.**

### 🟨 THE FINDING, REWRITTEN ON ITS TRUE PREMISE
⛔⛔ **THE 2,000 ms BOUND IS AN EQUALITY BETWEEN TWO INDEPENDENT LITERALS, AND THE ONE THAT READS LIKE THE KNOB IS INERT WHERE IT BINDS.**
- `lpa:1332` — the **venue** branch — tests `this.WS_CACHE_FRESH_MS` (`:368`, `2000`, private). **The engine's `2000` argument is NOT read there.**
- The argument governs only `lpa:1346` `if (age <= staleThresholdMs)`, which returns the cached entry **UNDER ITS ORIGINAL SOURCE**.

⇒ both literals are `2000` today, so branch 2 is **unreachable for a venue source** and the bound holds. ⚠️ **RAISE THE CALL-SITE LITERAL — the one an implementer reaches for — and you do not widen the venue window: you OPEN branch 2, which re-serves a STALE entry still tagged `kraken_ws`, and it passes `isKrakenVenueSource` at `aee:1672` straight into `evaluateTECExit`.**

⛔ **AND THE CENSUS SAYS THAT IS NOT HYPOTHETICAL ELSEWHERE — EVERY `getPriceWithFallback` CALL SITE AT THE REF, production and test, enumerated:** the exit trigger is the **ONLY production caller at 2000**. `routes.ts` ×5 (`:10728`, `:12264`, `:12799`, `:12888`, `:13088`), `aee:917`, `active-portfolio-manager.ts:308` and `:631` pass **5000**; `verification-test-protocol.ts:331` passes **30000**. **They sit on the far side of that equality today.** ⚠️ **Whether any of them DECIDES anything is UNTRACED and is NOT claimed here** — it is the census `3n.o` runs, not a finding this scope makes.

**DISPOSITION (§9.4 — 3, its own placed item):**
> `HOME: B-CRYPTO-MARK-AGE-GATE, owner CC-C, placed in PHASE_19_PLAN at row 3n.o, after 3n.n`

**ITS PREMISE, REWRITTEN:** the crypto mark's 2,000 ms bound is a **per-call-site literal that only coincidentally equals the adapter's private constant at the one site where it binds** — not class-keyed, not DB-governed, not risk-derived, and never counted as an age refusal. ⛔ **NOT the old premise ("nothing refuses it"), which is false.** **Folded in on Langston's surfacing:** `aee:917` computes `slTriggered`/`tpTriggered` for the diagnostics endpoint off a **5,000 ms** window with **no venue predicate** — display only, and the same "which crypto reads are age-bounded" question.

⚠️ **RESIDUAL NAMED: a refused check is an UNGUARDED position for that cycle.** True today whenever the venue chain yields nothing; this row may change the RATE, which is why P1 measures it first.

---

## 6. ⛔⛔ THE CONSUMER BOUNDARY — **B5**, AND A SEPARATE LOCAL

**`currentPrice` is NOT reassigned. A new local `triggerPrice` is introduced and passed to `evaluateTECExit` ALONE.**

| consumer | job | changes? |
|---|---|---|
| `evaluateTECExit({ currentPrice })` `:2174` | **TRIGGER** | ✅ **→ `triggerPrice`** |
| `closePosition(…)` `:2056`, `exitProvenance.decisionPrice` `:1983`/`:2061` | **BOOKING** | ⛔ no — job 4, separate row |
| `:1897-1905` unrealized P&L **+ the DB write to `active_open_positions`** | **the UI-visible mark** | ⛔ no — moving it silently changes what Kyle sees |
| `:1892` trace · `:1927` `lastExitChecks` · `:2111-2124` distance + `EXIT_EVAL` | reporting | ⛔ no |
| `:1966`-`:2028` maker-rest trade-through | fill adjudication | ⛔ no |
| `:2308`/`:2319` shadow `mid:` | the counterfactual's own field | ⛔ no — see §8 |

⚠️ **CONSEQUENCE, STATED NOT DISCOVERED: the trigger fires on the bid while the exit books at the mid.** Deliberate, temporary, conservative, and closed by the booking row.

### ⛔ AND LANGSTON'S CONDITION — THE TWO ARTEFACTS THAT GO FALSE, CLOSED HERE
1. **`checkExitConditions` returns `price: currentPrice`** and a reason reading *"Price 5.0250 hit stop 5.0216"* — **a mid ABOVE the stop it claims was hit, on every bid-triggered stop.** ⇒ **the reason string and the returned `price` carry the TRIGGER price; the booked price is stamped separately and both appear, so a reader can never mistake one for the other.**
2. **`aee:2058-2060`** — *"the decision price IS the exit price, so these two agree by construction here — and that agreement is itself the evidence that separates a taker close from the maker case."* ⛔ **That discriminator BREAKS under the boundary.** ⇒ **it is replaced by an EXPLICIT fee-mode stamp rather than an inferred one, in the same commit.** ★ **A discriminator that works by coincidence of two values is exactly what this batch exists to remove.**

## 7. VERIFICATION — PRE-REGISTERED BEFORE ANY CODE

| | |
|---|---|
| **P1-OBJ-1** | the exit-lane ladder shadow records per rung, keyed lane × class, and **acts on nothing** — proved by a mutation that makes it act, which must go red. |
| **P1-OBJ-2** | **the ladder's refusal rate and age distribution ON THE EXIT POPULATION.** n-floor pre-registered before the window opens. |
| ⛔ **P2 GATE** | **an ABSOLUTE threshold on the TOTAL refusal rate — ladder-availability AND age TOGETHER (Langston r4) — pre-registered before P1's window opens, and NOT a delta against `_priceSkipStreak`, which measures a different predicate (B2).** ⚠️ **Binding the ladder's rate alone would ship a second refusal source unbounded.** Above the threshold, `8a-P2` does not ship. |
| **P2-OBJ-1** | `evaluateTECExit` receives `triggerPrice` = the ladder bid; `currentPrice` is unreassigned and the other 23 consumers are byte-unchanged. |
| **P2-OBJ-2** | on refusal the check is SKIPPED. **Mutation: fall back to the mid — must go red.** |
| **P2-OBJ-3** | xStock byte-unchanged. |

## 8. THE SHADOW'S DISPOSITION **(B4)**

⛔ **r1's "the arms swap" is WITHDRAWN — FALSE at the object.** The shadow's arm is the raw book top (0.089%); the live arm becomes the ladder. **They diverge; a counterfactual that is not the live arm's complement measures nothing.**
✅ **ADOPTED — LANGSTON'S PREFERENCE AND THE PRE-AUDIT'S OWN INSTRUCTION (`PRE_AUDIT:558` P-8a): the `fg2Shadow` instrument is REMOVED at `8a-P2`,** its 41-row result already read and recorded in §2. **P1's exit-lane funnel replaces it and measures the thing that is actually going live.**
