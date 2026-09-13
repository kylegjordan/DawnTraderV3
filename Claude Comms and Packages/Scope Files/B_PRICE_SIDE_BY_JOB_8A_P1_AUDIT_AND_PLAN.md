# `B-PRICE-SIDE-BY-JOB` ROW `8a-P1` — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Batch:** `B-PRICE-SIDE-BY-JOB` (`3n`) · **Row:** `8a`, phase **P1 (shadow only)** · **Owner:** CC-C · **change-class: architecture**
**r1, 2026-09-14. Everything below re-derived at `origin/migration/aws-supabase` = `e20d1ee72`.**
**Scope: `B_PRICE_SIDE_BY_JOB_8A_SCOPE.md` r4. Langston: *"P1's code may proceed — shadow-only, unaffected."***

> ⛔ **P1 CHANGES NO BEHAVIOUR.** It wires D3's ladder into the crypto exit loop as a recorder, measures what it would have produced, and **acts on nothing.** The flip is `8a-P2` and is gated on what P1 measures.

**SOURCES READ (§9.5, six sources, named):** (1) the **CODE** at the ref — `active-execution-engine.ts`, `live-pricing-adapter.ts`, `price-cache.ts`, `kraken-websocket-adapter.ts`, `core/calculations/{touch-price,level-basis}.ts`, `signal-orchestrator.ts`, `vts-runner.ts`, `rtb-refresh-service.ts`; (2) **runtime logs + DB — NOT consulted this round, and that is a judgement, not an omission:** P1 adds no behaviour to observe, and the population it will read *does not exist until it deploys*; (3) **SIM S26 + S27**; (4) **System Manual** — silent on an exit-lane ladder, which is this row and not a gap; (5) **`RUNNING_ISSUES`** — searched, and **it refuted a finding of mine**, see §0; (6) **`bridge/canonical/`** — not consulted: `selectTouchPrice` was authored 2026-09-05 under this batch, long after the 2026-01/02 governance change, and its provenance is in this batch's own record.

---

## 0. PREVIOUSLY STATED / NOW *(§9.2 — at the top, because a number that moved between the scope and the audit is what the reader is approving)*

> **PREVIOUSLY STATED (scope r3 §5 and `3n.o`):** the crypto exit path has no mark-age gate; a stop can be evaluated against an arbitrarily old mark and nothing refuses it.
> **NOW:** **FALSE.** The crypto mark is age-bounded structurally at **2,000 ms** — `aee:1652` → `live-pricing-adapter.ts:1332` (`age <= WS_CACHE_FRESH_MS` **AND** `isKrakenVenueSource`) → else REST-fetch → else `last_known_good` (`:1404`), which fails the venue predicate at `aee:1672` and skips the tick.
> **REASON:** Langston's BLOCKER, re-derived by me at the object. ⛔ **And `RUNNING_ISSUES.md:7278` already recorded that mechanism verbatim — I filed a finding my own ledger refutes.** Corrected in scope r4 (`e20d1ee72`); `3n.o` survives on a rewritten premise.

> **PREVIOUSLY STATED (scope r3 §4):** `exit_ladder_max_age_ms` is pre-registered **from P1's measured age distribution**.
> **NOW:** derived from a **risk statement independent of the observed ages**; P1's distribution then *measures* the refusal rate at that value.
> **REASON:** Langston r4 correction 1 — a ceiling set from the distribution it filters IS the refusal rate, so §7's gate would pass by construction. ✅ **AUDIT FINDING A-5b below makes that structural rather than promised.**

---

## 1. THE AUDIT

### A-1 — THE DECISION INSTANT ALREADY EXISTS IN THE EXIT LOOP, AND IT IS `_exitProvenanceBase`'s SITE
`aee:1814-1860` builds `_bookX` and `_exitProvenanceBase` **once per position per tick, above the exit-condition evaluation, for every position on every tick** — its own docblock says exactly that (`:1830-1832`).
⇒ **The ladder walk belongs there**, on the same read, so the recorded quote and `exit_decision_price` share one instant. Any site below it would sample a *second* instant and reproduce `3n.n`'s defect one layer over.

### A-2 — `getBookForFill` HANDS BACK AN AGE, NOT A STAMP — AND THE RECONSTRUCTION IS ALREADY PRECEDENT
`kraken-websocket-adapter.ts:3560-3580` returns `{ asks, bids, ageMs }`, where `ageMs = Date.now() - updatedAt` and `bookUpdatedAt.set(internalSymbol, Date.now())` at `:1162` ⇒ **OUR RECEIPT CLOCK, never the venue's** ⇒ `clockBasis: 'receipt'`.
✅ **`signal-orchestrator.ts:2668` ALREADY reconstructs `stampMs: _lbNow - _lbBook.ageMs`, with a comment written specifically so nobody later "simplifies" it into `Date.now()`.**
⇒ **REUSE the precedent. Do NOT widen the adapter's return type.** *(I considered adding `capturedAtMs` to `getBookForFill` and rejected it: a documented precedent already exists, and two representations of one instant is how the two drift.)*

### A-3 — ⭐ `'exit_trigger'` IS A DECLARED STAGE WITH **ZERO** PRODUCTION WRITERS
Whole-repo at the ref, `exit_trigger` occurs **twice**: `level-basis.ts:623` (the declaration) and `server/tests/unit/side-age.test.ts:142`, which asserts `row('active:crypto_spot:exit_trigger')` **is `undefined`** — a test that PINS THE ABSENCE. The other three stages all have writers: `rtb-refresh-service.ts:455`, `signal-orchestrator.ts:2582`, `vts-runner.ts:1554`.
⇒ **The stage was declared in advance for this row. P1 is its first writer, and `:142` must flip from a pinned absence to a positive assertion — that flip is itself evidence the writer landed**, rather than a test edited to accommodate one.

### A-4 — ⛔⛔ THE TWO RECORDERS DISAGREE ABOUT WHICH DIMENSION SEPARATES THE EXIT POPULATION

| recorder | key | separates the exit population? |
|---|---|---|
| side-age probe — `level-basis.ts:750` `sideAgeKey` | `<lane>:<assetClass>:<stage>` | ✅ **YES** — via `stage: 'exit_trigger'` |
| the funnel — `LevelBasisRungKey`, SIM **S27** | `<lane>:<assetClass>:<rung>` | ⛔ **NO — there is no stage dimension** |

⇒ **Recording the exit walk under `lane: 'active'` would POOL the exit population with the level build, in the funnel.** That is precisely the failure the lane key's own docblock (`level-basis.ts:302-313`) exists to make impossible — *"a counter that aggregates two populations answers questions about neither"* — **committed inside the instrument built to prevent it. It would be the fourth instance of this batch's own class.**

✅ **RECOMMENDATION: add `stage` to `LevelBasisRungKey` — REQUIRED, and NOT to the shared `LevelBasisFunnelKey`.**
- **The precedent is in the same file and was created for this exact reason.** `LevelBasisRungKey extends LevelBasisFunnelKey` exists because `rung` is meaningless to the other two recorders, and its docblock refuses to widen the shared type. **`stage` is the mirror case — the funnel is the one recorder that lacks it.**
- **REQUIRED, not optional:** the two existing call sites become compile-forced to name `active_signal_birth` / `vts_signal_birth`. A default would let the exit silently inherit a level-lane label.

⛔ **REJECTED ALTERNATIVE — adding `'exit'` to `LevelBasisLane`.** `lane` means **WHICH RUNNER** (`:302-313` names *"the active orchestrator and the VTS runner"*), and **the exit loop IS the active runner.** A lane value of `'exit'` would make `lane` mean two different things depending on which value it holds, and it would leave `side-age.test.ts:142`'s pinned absence true-but-misleading — it would read as *"the exit stage never fires"* while the exit fires under another lane.

### A-5 — THE FUNNEL CARRIES NO AGES, SO P1-OBJ-2 IS NOT SERVED BY IT
`FunnelCell` (`level-basis.ts:382-393`) is `{ rung, accepted, byReason, byAcceptedSource }` — **no age term anywhere.** The age distribution lives in the side-age probe (`SIDE_AGE_BUCKET_EDGES_MS`, `buckets`, `maxMs`, `negative`).
⇒ **P1 writes BOTH recorders on ONE walk.** Together they give the **TOTAL** refusal rate Langston's r4 correction demands: **availability** from the funnel's `byReason`, **age** from the histogram. Neither alone does.

### A-5b — ⭐⭐ AND THIS IS WHAT DISSOLVES THE CIRCULARITY **STRUCTURALLY**, RATHER THAN PROMISING IT
The side-age probe measures **the TICKER leg's cache age** — *not the age of the quote the ladder ACCEPTED*, which may be the book's. On this lane the two nearly coincide (the socket carries a book for ~1 symbol), but **"nearly" is not "is", and a ceiling sweep has to be exact.**
⇒ **P1 additionally records the ACCEPTED quote's own `ageMs`**, which `recordTouchSelection` already holds as `sel.quote.ageMs`. **Extend `FunnelCell` with `acceptedAgeBuckets` + `acceptedAgeMaxMs`** on the existing edges, in the same cell, under the same key.
★★ **CONSEQUENCE, AND IT IS THE POINT: with the accepted-age histogram on the record, the refusal rate at ANY candidate ceiling is derivable post-hoc from ONE window.** So P1 does not need `exit_ladder_max_age_ms` to exist yet; the risk-derived value can be chosen afterwards and **evaluated without a second window** — and **a value that fails the gate cannot be quietly re-picked until it passes, because every candidate's rate is already recorded.**

### A-6 — ⛔⛔ THE EXIT MARK AND THE LADDER'S TICKER SIDES COME FROM **TWO DIFFERENT CACHES**

| object | what it is | who reads it |
|---|---|---|
| `LivePricingAdapter.priceCache` | a **private** `Map<string, CachedPrice>`, `live-pricing-adapter.ts:351` | `getPriceWithFallback` ⇒ **the exit MARK** |
| `priceCache` (`UnifiedPriceCache`) | the module singleton, `price-cache.ts:743` | `getCachedPrice` ⇒ **the level lane's ticker leg** (`signal-orchestrator.ts:2622`) |

**Two stores, two writer sets, two cadences.** ✅ `aee:87` **already imports the singleton**, so P1 adds no new dependency.
For P1 this costs nothing — it records and decides nothing. ⚠️ **BUT IT IS LOAD-BEARING FOR P2 AND MUST BE STATED BEFORE P2 IS WRITTEN: the adapter's 2,000 ms venue gate does NOT apply to the singleton read, so P2's trigger source steps OUTSIDE the one age bound the mark has today.**
★ **That is not an argument against P2 — it is the reason scope §4's `exit_ladder_max_age_ms` is STRUCTURAL rather than decorative**, and §4 must carry that sentence.

### A-7 — THE `fg2Shadow` BID ARM IS A DIFFERENT INSTRUMENT AND IS NOT A BASELINE FOR P1
`aee:2248` enters only when `fg2BookBid` is finite and positive ⇒ **it is SILENT exactly on the population P1 most needs to measure** (no book). It is the RAW book top: no validity checks, no age gate, no ticker rung, no refusal path. *(Scope r3 B4 established this for the flip; it binds the measurement for the same reason.)*

### A-8 — PROCESS-LIFETIME WINDOW, AND A RESTART **ENDS** IT
SIM **S27**: the funnel is a module singleton, not persisted, not evicted — *"a restart ZEROES it, so it is a RATE WITHIN ONE LIFETIME and never a historical series."* `_sideAge` is the same shape.
⇒ **P1's window is ONE UNINTERRUPTED pm2 lifetime, anchored on `pm_uptime`** — **never** on `dt-deploy`'s `deployed_at`. A restart mid-window **VOIDS** it; it does not extend it.

### A-9 — THE SPREAD BOUND WILL NOT BIND ON THIS LANE, AND THAT IS STATED IN ADVANCE
`LEVEL_BASIS_OBSERVATION_MAX_SPREAD_FRACTION = 0.50`, against a measured crypto median spread of **0.199%**.
⇒ `implausible_spread` will be ~0 on the crypto exit lane **by construction, not by health** — so that zero carries no information and must not be reported as though it did. Whether the exit lane wants a tighter bound is **P2's question**, not P1's.


### A-10 — ⛔⛔ THE POPULATION IS TINY AT ANY INSTANT AND THE COUNTER CANNOT HOLD THE WINDOW IT NEEDS. **MEASURED, NOT ASSUMED.**
| measurement (live, 2026-09-14, bounded queries) | value |
|---|---|
| open positions **right now**, by class | **crypto 1**, xStock 3 |
| crypto closes per day, 2026-09-04 → 09-13 | **1, 2, 8, 8, 9, 3, 5, 7, 2** — ~4.5/day |
| **distinct crypto symbols** closing per day | **1, 2, 7, 8, 7, 3, 4, 7, 2** — close-to-one per close |
| pm2 `dawntrader` **current uptime** | **5.3 hours** · all-time `restart_time` = **614** |

⇒ **TWO CONSEQUENCES, AND THEY PULL AGAINST EACH OTHER:**
1. ⛔ **A WALK COUNT IS NOT A POPULATION.** With ~1 crypto position open, a per-tick ladder walk accrues thousands of rows **from one symbol's feed**. A refusal rate over that n describes **that symbol**, not "the exit population" — the `#1052` shape, where a large n hides a degenerate support. ⇒ **the n-floor must be stated in POSITION-LIFETIMES and DISTINCT SYMBOLS, with the walk count reported beside it as the explicitly non-independent denominator.**
2. ⛔⛔ **AND AT ~4.5 CLOSES/DAY A 30-LIFETIME FLOOR IS ~7 DAYS — WHICH AN IN-MEMORY COUNTER CANNOT HOLD.** A-8 says a restart VOIDS the window; the live process has been up **5.3 hours** against **614** restarts, and three sessions deploy to this box. **A process-lifetime counter and a seven-day floor are not compatible, and shipping both would produce a window that silently never completes.**

✅ **RECOMMENDATION — BOTH, because they measure two different things, and the precedent for the second is IN THIS LOOP ALREADY:**
- **the FUNNEL** keeps the high-frequency **walk-level** rate within one lifetime, with its structural-equality control. Read as *"the rate while the process was up"*, never as the window.
- **a DURABLE PER-POSITION STAMP** carries the window: accumulate `{walks, accepted, refused, byReason, maxAcceptedAgeMs}` per position and write it under `metadata.ladderShadow`, **throttled**, exactly as `_recordBookStateEvent` already mutates `position.metadata` every tick and throttles only the row write, and as `fg2Shadow` already stamps this same loop. ⇒ **the window then lives in `closed_trades.metadata`, one row per position-lifetime — which is the unit the n-floor is stated in anyway, and it survives every deploy.**
⚠️ **THIS IS A REAL ADDITION TO P1's SURFACE (a metadata write) AND I AM FLAGGING IT AS THE ONE THING IN THIS PLAN I MOST WANT ATTACKED.** The alternative — accept a process-lifetime window and a much lower floor — is cheaper and measures a narrower thing, and it is a defensible call I am not making unilaterally.

---

## 2. THE IMPLEMENTATION PLAN — every item names the finding it falls out of

| # | item | from |
|---|---|---|
| **P1-1** | In `aee`, at `_exitProvenanceBase`'s site, **crypto only**: build the two legs and call `selectTouchPrice`. Book leg from `_bookX` — `stampMs = _now - ageMs`, `clockBasis: 'receipt'`, `producer: 'kraken_ws_book'`, `bookEligible: true`. Ticker leg via `tickerLegFromCachedQuote(priceCache.getCachedPrice(normalizeToInternalSymbol(position.symbol)))`, `tickerBasis: 'ticker_bbo'`. Policy **STATED WITH ITS NUMBERS**: `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` (60,000) and `…MAX_SPREAD_FRACTION` (0.50), one ceiling governing both legs. | **A-1, A-2, A-6, A-9** |
| **P1-2** | Add **REQUIRED** `stage: LevelBasisStage` to `LevelBasisRungKey`; update `signal-orchestrator.ts:2692` → `active_signal_birth` and `vts-runner.ts:1613` → `vts_signal_birth`; the read surface gains a `stage` field. ⛔ **Shared `LevelBasisFunnelKey` UNCHANGED.** | **A-4** |
| **P1-3** | Write **BOTH** recorders on the one walk: `recordTouchSelection({ lane: 'active', assetClass: 'crypto_spot', stage: 'exit_trigger' }, sel)` and `recordSideAgeAttempt({ lane: 'active', assetClass: 'crypto_spot' }, { stage: 'exit_trigger', … })`. | **A-3, A-5** |
| **P1-4** | Extend `FunnelCell` with `acceptedAgeBuckets` + `acceptedAgeMaxMs` on `SIDE_AGE_BUCKET_EDGES_MS`, fed from `sel.quote.ageMs` inside `recordTouchSelection`; surfaced on the funnel row. | **A-5b** |
| **P1-5** | Flip `side-age.test.ts:142` from `toBeUndefined()` to a positive assertion on the `exit_trigger` row. | **A-3** |
| **P1-6** | Counters on the existing `EVAL_EXIT` line (`aee:2070`): `ladderAccepted`, `ladderRefused`, `ladderViaBook`. | **A-1** |
| **P1-7** | ⛔ **THE MUTATION PROOF (P1-OBJ-1): a mutation that makes the ladder ACT must go RED** — substitute the ladder quote's bid for `currentPrice` at the `evaluateTECExit` call and assert a test fails. **The test asserts the substitution actually MATCHED before reading the result** — a non-applying substitution reports as passing, measured on the `8c` instrument tests. | the row's **OBJ-1** |
| **P1-8** | Carry A-6's sentence into scope **§4** and A-9's into **§7**, before the window opens. | **A-6, A-9** |
| **P1-9** | ⛔ **THE DURABLE PER-POSITION STAMP** — accumulate the per-position ladder summary and write it under `metadata.ladderShadow`, throttled, on the `_recordBookStateEvent` precedent; it lands in `closed_trades.metadata` at the close. **This is what carries the window across restarts.** | **A-10** |

### ⛔ NOT IN P1 — STATED, SO THE BOUNDARY IS NOT INFERRED
No `triggerPrice`. **No consumer of the ladder result — all 24 `currentPrice` consumers byte-unchanged.** No `fg2Shadow` removal (P2's, per scope §8). No xStock. **No `exit_ladder_max_age_ms` yet** — A-5b is why P1 does not need it.

---

## 3. PRE-REGISTRATION — WRITTEN BEFORE THE CODE, NOT AFTER THE READ

| | |
|---|---|
| **window** | ⛔ **TWO WINDOWS, DELIBERATELY, BECAUSE THEY MEASURE DIFFERENT THINGS (A-10).** **(i) the FUNNEL rate** — ONE uninterrupted pm2 lifetime, anchored on **`pm_uptime`**, never on `deployed_at`; a restart **VOIDS** it **(A-8)**. **(ii) THE WINDOW PROPER** — the durable per-position stamp in `closed_trades.metadata`, which **survives restarts** and is the one the n-floor and the P2 gate read. ⚠️ **Live uptime when this plan was written: 5.3 hours, against 614 all-time restarts.** |
| **n-floor** | ⛔ **STATED IN POSITION-LIFETIMES AND DISTINCT SYMBOLS, NEVER IN WALKS (A-10).** **PRE-REGISTERED: 30 closed crypto position-lifetimes across ≥ 15 distinct symbols.** Derived from the measured rate — **~4.5 crypto closes/day over 2026-09-04 → 09-13, close-to-one distinct symbol per close** ⇒ ~7 days. The walk count is reported **beside** it and labelled **NON-INDEPENDENT**. Below the floor the window is **UNDERPOWERED, not negative.** |
| **positive control** | the funnel's own structural equality — every walk increments the `book` and `ladder` cells **exactly once**, so their `attempted` are equal **by construction**. Unequal ⇒ the recorder is broken and the window is void. |
| **what P1 reports** | the ladder's **accept / refuse** split on the exit population; `byReason`; `byAcceptedSource`; the **ticker-side** age histogram **and** the **accepted-quote** age histogram. |
| ⛔ **what P1 does NOT report** | any comparison against `fg2Shadow` **(A-7)**, and any reading of `implausible_spread ≈ 0` as health **(A-9)**. |

---

## 4. KNOWN LIMITS, STATED AS LIMITS

1. **The ticker leg's `producer` names the MARK's writer, not the SIDES' writer** — `touch-price.ts`'s own RIDER 1. WS-pushed sides sitting under a later REST mark record as `kraken_rest`. ⇒ **`byAcceptedSource`'s transport split UNDERSTATES the pushed transport** — conservative, in the same direction as the venue-skew note.
2. **`3n.l` (`#1056`) puts a FLOOR under rung 2 that is an artefact of OUR OWN WRITE PATH** — the REST adapter parses the sides and discards them one line before the write. ⇒ **a low rung-2 recovery may NOT be read as "the ticker sides are not there."** `3n.l` is ordered before `8a` for exactly this reason.
3. **Venue-stamp skew is zero-tolerance** — `buildLevelBasis` refuses a venue stamp even 1 ms ahead as `age_unknown`, and only WS-sourced sides carry one. Small exposure, and it biases **against** the pushed transport.
4. **P1 measures AVAILABILITY, not CORRECTNESS.** That the ladder *could* have named a price says nothing about whether that price was the right one — that is `3n.n`'s decomposition, and it is not claimed here.
