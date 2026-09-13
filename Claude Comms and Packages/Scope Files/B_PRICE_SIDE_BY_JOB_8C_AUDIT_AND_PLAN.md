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

| lane | attempted | accepted | refused | `no_book` | `stale_book` |
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

`tec-evaluator.ts:273` returns `exitPrice: input.stopPrice` and `:282` `exitPrice: input.targetPrice` — the **level itself**, not the price that triggered it. ⇒ **re-basing a level re-bases what gets BOOKED on every stop and every target.** Any observation window on this row must read the booked price, not only exit timing.

### A8 — THE TRAILING RATCHET IS OFF, SO THE CONSTRUCTED LEVEL IS THE OPERATIVE ONE

**MEASURED live**, `module_constants` where `module_name = 'trailing_exit'`: `trailing_enabled_active = false` and `trailing_enabled_vts = false` on **all four** asset classes since 2026-07-23; `break_even_enabled = false` on all four.

`trailing-exit-controller.ts:516-517` gates `isMoonbagQualifier` on that flag, and its own comment states a false flag makes the TRAILING_TAKE ladder unreachable.

⇒ **The `Math.max(...)` ratchet arms that would otherwise dominate a re-based stop are not in play. The level `8c` constructs is the level that decides.** **This makes the change MORE consequential, not less** — nothing absorbs it.

### A9 — OBJ-3b IS NOT ASSERTABLE, AND THE REASON HAS CHANGED

The scope's §7.1 says OBJ-3b *"BECOMES ASSERTABLE in OBJ-8c, because the trigger moves to the bid in the same layer."* **The trigger does not move in this layer, because row `8a` is not built** (§0 above). Verified at the object: `active-execution-engine.ts:2220-2221` — *"The live decision above read the book MID"* — and the bid arm beneath it is `F-G-2` OBJ-0's shadow, which *"NEVER closes a position."*

★ **This supersedes the disposition I recorded on 2026-09-12 from `F_G_2_PROGRESS_REPORT.md` at `90f22b990`.** That read was answering *"what did F-G-2 decide"* — a question r5 had already retired when it moved the switch into this batch as row `8a`. **The honest reason OBJ-3b cannot ship is nearer and simpler: its other half is unbuilt, and it is mine to build.**

### A10 — THE SPREAD IS ALREADY COUNTED ONCE, IN THE COST MODEL

`SYSTEM_MANUAL.md:699-701`: `executionEntry = baseEntry × (1 + slippage + spread/2)`. ⇒ **moving the entry onto the ask without reconciling that term counts the spread twice.** The scope row names *"spread is counted once"* as a requirement; this is the object it refers to.

---

## 2. THE PLAN — every item back-references its finding

| # | item | from |
|---|---|---|
| **P1** | **Feed `buildLevelBasis` from D3's full ladder, not the book alone** — book top → ticker sides inside D6's age → refuse. The rung actually taken is recorded in row `7c`'s vocabulary (`book_top` / `ticker_bbo` / `ticker_default`). **STILL SHADOW.** | A3, A4, A5 |
| **P2** | **Re-measure the funnel on the ladder before anything switches on, with the acceptance floor PRE-REGISTERED** — and a **positive control**: the refusal arm must be shown firing on a constructed absent-sides fixture, or a low `no_book` count is unreadable. | A2 |
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

---

## 4. SECOND-READER RECORD

`REVIEWER r1: claim-only (mode B) · what other states of the world are consistent with the objects that settle "re-basing levels onto the bid makes both legs fire earlier" · HIT · re-derived y`

It named the opposite operators at `tec-evaluator.ts:270/:279`, the level-clamped `exitPrice`, the ratchet question, and the `spread/2` double-count. **Every one was re-derived at the ref before use** (A6, A7, A8, A10).

It also read staging as `2dbc512ee` — from a **stale section of my own change list**, which is a record defect I own and have now dated rather than deleted.
