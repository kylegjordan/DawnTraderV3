# B-EXIT-PROVENANCE — PRE-AUDIT (Step 2)

> Owner: Claude Analyst (CC-C) · 2026-08-23 · change-class **architecture** · design **(B)**, Langston-ruled
> Scope r2: `B_EXIT_PROVENANCE_SCOPE.md` · Ruling staged at `/home/langston/inbox/B-EXIT-PROVENANCE/`

## 0. LANGSTON'S DECIDING ARGUMENT — RE-DERIVED, NOT TAKEN ON REPORT

He ruled (B) on an argument I did not make, and I verified it at source rather than accept it:

```
live-pricing-adapter.ts:67 → export function isKrakenVenueSource(source: string): boolean {
```

**The parameter is `string`, not the union.** So under design (A) — widening the `source` vocabulary —
`tsc` **cannot** catch a missed widening at the one site that IS the trading gate, while flagging it
everywhere else that is typed. **(A) would have put the outage exactly where the safety net has a
hole.** That is a stronger argument than my gate-consumer count and it is why (B) is right.

**★ AND MY OWN CENSUS WAS INCOMPLETE, WHICH IS ITSELF EVIDENCE FOR (B).** I enumerated four consumers
of the *predicate*; (A) widens a *value*, and by-value sites live outside it. All five re-derived
verbatim:

| site | form | why it matters |
|---|---|---|
| `live-pricing-adapter.ts:957` | `cached?.source === 'kraken_ws' \|\| … 'kraken_equities_ws'` | equality, silent on a new value |
| `routes.ts:10503` | `e.source === 'kraken_ws'` | equality |
| `routes.ts:12299` | `priceSource.includes('kraken_ws')` | **survives only by substring accident** |
| `kraken-websocket-adapter.ts:95` | `source: 'kraken_ws';` | the **literal type** on `PriceTickEvent` |
| `live-pricing-adapter.ts:699` | `source: … = 'kraken_ws'` | the **default value** |

**A census being wrong on its first telling is the case for the design where a miss cannot hurt.**

## 1. C-B2 — EVERY WRITER INTO THE PRICE CACHE, WITH ITS HONEST PRODUCER

⚠️ **THIS SECTION WAS REWRITTEN, NOT ANNOTATED.** Its first version censused the *callers* of the
cache and reported "four writers". That was wrong in method, not just in count — censusing callers
**counts a multi-caller writer once and misses a caller-less one entirely**, which is exactly what
happened. Langston's correction; the body is edited so the file never holds two answers.

**Census the `priceCache.set` SITES. THREE writers, one of which fans in:**

| # | `priceCache.set` | function | how it gets its source |
|---|---|---|---|
| **W1** | `live-pricing-adapter.ts:706` | `updateCache` | **fan-in — 3 callers**: priceTick subscriber `:1024`, `aee:1145`, `aee:1220` |
| **W2** | `live-pricing-adapter.ts:784` | `seedLastKnownGoodPrice` | sole caller `aee:3617` |
| **W3** | `live-pricing-adapter.ts:307` | `fetchPrice` | **writes `quote.source` VERBATIM with `cachedAt: Date.now()`** |

**★ W3 IS THE LAUNDERER.** `fetchLivePrice` can return `last_known_good` (`:348`, `:389`, `:418`);
`:307` re-stamps it `cachedAt: Date.now()`; `getPriceWithFallback` then serves it **as fresh**. It is
live — `start()` (`:151-161`) fires `fetchAllPrices()` immediately then every 15 s, armed
unconditionally from `index.ts:954`. **It also stamps `kraken_rest` (`:369`), the same token as the
engine's REST fallback (`aee:1220`)** — one token, two producing handlers.

**COMPILE-TIME NET, honestly:** C-B1's required `producer` on `PriceTickEvent` reaches **only W1's
priceTick caller**. `aee:1145`, `aee:1220`, W2 and W3 all construct or pass `CachedPrice` shapes
directly and sit **outside** it. ⇒ **the census is the protection for four of the six paths.**

## 2. C-B3 — THE CLOSED VOCABULARY, EVERY TOKEN WITH ITS EMIT SITE

| token | emit site | note |
|---|---|---|
| `kraken_ws_ticker` | adapter `:692` `handleV2TickerUpdate` | |
| `kraken_ws_book_mid` | adapter `:916` `handleV2BookUpdate` | **the `#741` path** |
| `kraken_ws_ticker_v1` | adapter `:1049` (defined `:938`) | **UNREACHABLE — `#742`** |
| `kraken_equities_ws` | `aee:1145` | |
| `kraken_rest_engine_fallback` | `aee:1220` | split from the poller |
| `kraken_rest_poller` | `lpa:369` in `fetchLivePrice` → W3 | split from the engine leg |
| `xstock_rest_gate_reserve` | `lpa:348` → W3 | ★ **BY DESIGN, not a failure** — the B8.9 xStock REST class-gate; no venue ask was made, nothing failed, fires every poll |
| `last_known_good_all_apis_failed` | `lpa:389` → W3 | genuine outage leg |
| `last_known_good_fetch_exception` | `lpa:418` → W3 | genuine outage leg |
| `last_known_good_reserve` | **`lpa:925` inside `getPriceWithFallback` (`:851`)** | ★ **the exit path's own leg — see below** |
| `entry_seed` | `lpa:784` (W2) | sole caller `aee:3617` |
| `mock` | `fetchMockPrice`, **defined `lpa:527`** (called `lpa:300`) | enumerated, not excluded |

Named for the **producing handler, not the feed** — the feed name is what conflated a ghost midpoint
with a ticker print in the first place.

**★ `no_book_for_class` WAS DROPPED.** It existed nowhere but this document — a closed fence with an
unproducible member is #546 wearing the fix's clothes — and it was wrong because it **conflated two
facts**: the producer vocabulary answers *where the PRICE came from*; *"this class has no order
book"* is a property of the **`bookMid` field**.

**★ `no_price_produced` — THE MEMBER THE NULL-PRICE ARM NEEDS, AND WHY IT IS NOT AN OPTIONAL FIELD.**
`producer` is required on `PriceQuote` (C-B1), and `PriceQuote.price` is **nullable** — the
`no_reliable_price` returns (`lpa:353-359`, and the `fetchLivePrice` no-price leg) construct a quote
with **no number in it**. A required closed union with a constructible site outside it is a runtime
value outside the fence on day one — **the same shape as the member I just caught, one paragraph up.**

⇒ the union carries **`no_price_produced`**, matching this file's own `no_reliable_price` convention
(*typed honesty* — a state that can occur must remain representable). **Not an optional field:**
optionality would re-open the absence-vs-omission hole C-B1 exists to close.
**FENCE: `producer === 'no_price_produced'` ⟺ `price === null`** — a biconditional, so neither a
priced quote wearing the null token nor a null quote wearing a producer token can pass.

**★ `last_known_good_reserve` — THE MEMBER MY CENSUS MISSED, AND IT IS THE ONE ON THE EXIT PATH.**
`lpa:925` constructs a fourth `last_known_good` **inside `getPriceWithFallback` itself** — the
function the close path calls (§4's `active-portfolio-manager.ts:335` calls exactly it). I listed the
three inside `fetchLivePrice` and stopped. **A closed union missing the most exit-relevant member is a
runtime value outside the fence on day one** — the same `manual_stop_kraken_ws` failure I caught one
file over, reproduced by me in the very section that fixes it.

**It gets its OWN token because it is a different shape, and on one axis it is the HONEST leg:** it
**writes nothing to the cache** and returns **`timestamp: cached.timestamp` UNREFRESHED**. Its own
comment names it correctly — *"A stale re-serve is a MEMORY of a venue read, not a venue read."*
⇒ **`observedAt` behaviour: carried from the cache entry, and it CANNOT corrupt anything because this
leg performs no write.** Folding it into `last_known_good_restamp` would label an honest leg with a
laundering token.

### THE FENCE — REWRITTEN, because my threshold false-failed correct behaviour

⛔ **My first version asserted a gap "greater than one poll interval". That is wrong:**
`getPriceWithFallback` calls `fetchPrice` **ON DEMAND** (`lpa:901`), off the 15 s clock — so a re-serve
can occur milliseconds after a genuine venue write, and a **correct** carry-through then yields a
sub-15 s gap and **my fence would have failed green behaviour.** The threshold bought no
discrimination and added a false-failure mode.

**The property that actually separates carry-through from refresh, and which a refresh cannot satisfy:**
1. `observedAt` **strictly less than** the write time (gap > 0), **and**
2. `observedAt` **INVARIANT across ≥2 successive re-stamps of the same symbol while `cachedAt` advances.**

**Fence conditions, per the PERPFEED standard:** subject **DERIVED** (every producer token resolved
from the union at runtime, never a hand-maintained name list); **proved able to fail** by a
with/without discrimination pair (a simulated refresh must make it red); and it **RUNS in CI**, not
skipped.

⛔ **AND THE DRIVER MUST BE THE PRODUCTION WRITE SITE (Langston's Step-3 condition).** Drive the fence
through `fetchPrice` → `lpa:307`, **never a hand-built `CachedPrice`.** A fixture-constructed entry
asserts a property of the fixture; only the real write site can prove `:307` **propagates**
`observedAt` from the quote rather than stamping it. **That one line is what the whole mechanism rests
on.**


**`mock` is ENUMERATED with evidence, not assumed unreachable:** gate is
`process.env.ENABLE_MOCK_PRICING === 'true'` (`index.ts:952`); staging's **process env does not set
it** (read from `pm2 jlist`, not `.env`); `NODE_ENV=production`; and the running process's own boot
line reads **`2026-08-22 22:01:00Z [B9.PRICING] Mock mode: DISABLED (production mode)`**. Unreachable
in this deployment, producible by one env var ⇒ it must exist in the fence.

## 3. THE DEAD PRODUCER — FINDING KEPT, DELETION REFUSED, AND HIS REASONING IS BETTER THAN MINE

`handleTickerUpdate` (`:938`) is unreachable: **one occurrence in the whole tree** (its own
definition — population: `server/`, `client/`, `shared/`, `server/tests/`), `private` so no external
caller is possible, and `handleMessage:458` routes only on `message.channel`, which a v1 array payload
does not carry.

**I proposed deleting it here. He refused, on three grounds I accept:** this batch's entire safety
case is *"no decision path changes,"* and a rule-18 deletion **changes what rollback means** (today:
drop the columns); **under (B) my own argument for deleting it evaporates** — a handler that never
emits gets no producer stamp, so it is no longer coupled to the design; and a 3,483-line adapter with
one dead v1 handler probably carries more v1 residue, which wants **one sweep, not picking**.

**§13 home: `B-WS-V1-RESIDUE-SWEEP`, owner CC-C, due 2026-09-05.** In this batch: a scope line and one
comment at `:938` recording that producer #3 is unreachable — so a later reader does not read
two-of-three stamped as a **missed** stamp.

## 4. ★ THE `manual_stop_` FINDING — MY SITE WAS RIGHT, MY MECHANISM WAS WRONG, THE REAL DEFECT IS BIGGER

I claimed `forceClosePosition` *"has no price context at all"* and proposed an `operator_supplied`
sentinel. **Both wrong.** Re-derived: it has exactly two callers, both inside
`forceCloseAllOpenPositionsOnStop` (`active-portfolio-manager.ts`), and **both carry price context**:

- `:320` — the position's own entry price, tagged `'entry_price_fallback'`
- `:335` — `getPriceWithFallback(symbol, 5000)` — **the same adapter, same cache, same producer chain
  as a normal close** — tagged `` `manual_stop_${priceResult.source}` ``

So `operator_supplied` would have been **a mislabel of exactly the kind this batch exists to fix**:
this is a *system-initiated close-all on engine stop*, not an operator supplying a number.

**And nulls were never the risk on that path — UNENUMERATED VALUES are.** `priceSource` already
defaults to `'manual_stop'` (`:804`), and `manual_stop_kraken_ws` is a **constructed string that would
fail OBJ-1's fence on day one.**

⇒ **OBJ-5 RE-STATES: no post-deploy close carries a value outside the enumerated vocabulary.**
⇒ **And the honest decomposition is three separate facts that are currently concatenated into one:**
`manual_stop` is the exit **condition** (already `type:'manual_stop'` at `:815`); the venue tag is the
**source**; the handler is the **producer**. **Stop concatenating them.**

## 5. BLAST RADIUS

| | |
|---|---|
| **Decision paths** | **none.** `source` is untouched, so `isKrakenVenueSource` and all five by-value sites are untouched **by construction** — the reason (B) was chosen. |
| **Type surface** | `PriceTickEvent` (`kraken-websocket-adapter.ts:95`), **`PriceQuote` (`lpa:45-52`)**, **`CachedPrice` (`lpa:54-60`)**, `updateCache` (`:699`), `getPriceWithFallback`. ⚠️ **These two were cited SWAPPED in the first version** — it is `PriceQuote` that carries `no_reliable_price` and a nullable `price`, not `CachedPrice`. `producer` **required + closed union** (C-B1) ⇒ producer #4 is a **compile error**, not a silent absence. |
| **Cross-cutting** | `PriceTickEvent` / `CachedPrice` are read by **entry as well as exit** ⇒ change-class **architecture**; SIM cross-cutting registry takes a content update. |
| **Write path** | `closePosition` + its three call sites, symmetric per the B8.6 rule. |
| **Rollback** | drop the columns + revert the type widening; nothing reads them yet. |

## 6. RISKS ACCEPTED, NAMED

1. **`producer` required on `PriceTickEvent` is a breaking type change** — deliberate. Optional would
   let producer #4 omit it, and that absence is indistinguishable from a missed stamp (#546).
2. **The 127 historical unassessable rows are untouched and stay untouched.** This batch is
   forward-only and fixes no existing trade. Stated in the scope, repeated here, and it must not blur.
3. **Storage:** nine nullable columns. ⚠️ The disk gauge is at a warning level; **the completion
   report reads the LIVE gauge, never the alert body** — Langston's note, and the alert's figure is a
   mint from 2026-08-22 rather than a current reading.

---

# B-EXIT-PROVENANCE — §2 ADDENDUM (origin-time) + cite fix

## 1. YOUR NEW FINDING — CONFIRMED, AND THERE IS A DETAIL THAT SHARPENS IT

Re-derived at `1d85c51f0`. Both `last_known_good` legs (`:381-390` all-APIs-failed, `:410-419`
catch) read the cache under **`if (cached && cached.price > 0)` and nothing else** — no age test —
then return `timestamp: new Date().toISOString()`, and `:307` writes `cachedAt: Date.now()`. So each
15 s poll during an outage refreshes **both** freshness fields on a price that never moved. Your
statement holds exactly: a two-hour-old price reads as ≤15 s old indefinitely.

**★ AND THE SHARPENING DETAIL: `cacheAge` IS COMPUTED ON BOTH LEGS AND ONLY LOGGED.**

```
const cacheAge = Date.now() - cached.cachedAt;
console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] … age=${cacheAge}ms reason=all_apis_failed`);
```

It is never compared to anything. **The one number that would catch this is measured, printed to a
rotating log, and discarded** — which is the *same shape as this batch's founding finding*, where
`exitPriceSource` is computed at close and thrown into `[B8.PNL][CLOSE_ATTEMPT]`. Twice in one
subsystem, the fact needed to detect a defect is produced and dropped.

## 2. THE §2 ADDITION — AN ORIGIN TIME CARRIED *THROUGH* THE RE-STAMP

You are right that `last_known_good_restamp` names the path without making the staleness
recoverable, and that a producer token on a number still lying about its age is a label, not a fence.

**`CachedPrice` and `PriceQuote` gain `observedAt: number` — the ORIGINAL venue observation time.**

- a genuine venue write sets `observedAt = Date.now()` (same instant as `cachedAt`);
- **a `last_known_good` re-stamp CARRIES `observedAt` THROUGH from the cached entry, unrefreshed** —
  that is the whole mechanism; `cachedAt` may move, `observedAt` must not;
- `getPriceWithFallback` returns it, so the close path can read it without new plumbing;
- the exit stamp persists `exit_price_observed_at` beside `exit_price_producer`.

⇒ **true age at the moment of the exit decision becomes `closed_at − exit_price_observed_at`,
recoverable from the row alone.** Without it, `#741`-class forensics on a stale-price close is
impossible after the fact, exactly as it was for the maker fills.

**FENCE — the operative statement lives in §2 and is not restated here.** An earlier version of this
paragraph carried a *"more than one poll interval"* threshold. **It is deleted, not annotated:** it
false-failed correct behaviour (`fetchPrice` is called on demand at `lpa:901`, off the 15 s clock), and
leaving a withdrawn number downstream of its replacement is how a document comes to hold two answers.

⚠️ **SCOPE HONESTY:** this fixes the *recoverability* of the staleness, **not the staleness itself.**
The age-unbounded re-serve is a live defect in its own right and this batch does **not** close it —
it makes it visible and measurable. It needs its own §13 home; I am not folding a behaviour change
into a batch whose entire safety case is "no decision path changes."

## 3. CITE FIX

`mock`: the emit site is **`fetchMockPrice`, DEFINED at `lpa:527`**; `lpa:300` is the CALL inside
`fetchPrice`. Same define-vs-emit ambiguity I fixed for `handleTickerUpdate` one section earlier and
then reproduced immediately — noted rather than quietly corrected.

## 4. ALERT READ-BACK, per your instruction

`563d32cd` → `resolved`, `resolved_at 2026-08-23T11:37:49.527Z`
`c59186da` → `resolved`, `resolved_at 2026-08-23T11:37:50.659Z`

Both landed. **But your discipline point stands and the outcome does not excuse the method:** I
reported the discharge without reading either back, and a short id would have no-opped with `exit 1`
while I reported a discharge that never happened. Same class as filing the ledger row and calling it
effective.

---

# STEP-2 ADDENDUM B — THE ENTRY / MAKER LEG (2026-08-26, after the scope cleared at r8)

> **WHY AN ADDENDUM:** this pre-audit was written when the batch was **exit-only**. Revisions 3-8 widened it to both legs and added the maker fill, three close sites and a second file. **None of that had audit treatment.** Per this step's binding format, anything reaching the plan without it would be flagged `UNAUDITED` — so it is audited here, **first**, and the plan below falls out of it.

## A. §9.5(a) COMPONENT CENSUS — EVERY HOP, repo-wide grep, tests excluded

### A1 · Who **WRITES** the pending→open transition?
**TWO, and I name them because an asserted absence needs presence-evidence:** `active-execution-engine.ts:991` (the maker fill — the site this batch stamps) and `core/trading/pending-maker-logic.ts:133` (the **pure** function's return shape, **not a DB write**).
⛔ **`circuit-breaker.ts:202` matched the grep and is a SUBSTRING COLLISION, not a third writer** — it is `state:"open"` on a *circuit breaker* result object (`{allowed:false, state:"open", reason:"Circuit open…"}`). **Recorded because "a matching name is not a matching thing" is the pattern that has cost this project most, and a census that silently drops a hit is indistinguishable from one that never saw it.**

### A2 · ★ Who **CREATES** an active pending-maker position? **ONE CREATOR — and my first answer was the wrong lane.**
- **`active-execution-engine.ts:3487` — the ONLY creator**, and it is **already class-general**: `assetClass: _tradeClass` (`:3470`), `resolveMakerMaxPendingMs(_openClass)` (`:3490`).
- ⛔ **`asset_classes/xstock_spot/eval-cycle.ts:962` is the VTS lane, NOT a second active creator.** Verified at the ref before accepting the correction: the file has **ZERO** hits for `createActiveOpenPosition` / `active_open_positions`; the object is `xOpenTrade`, terminating at **`registerOpenVtsTrade(xOpenTrade)` `:1127`**. Header `:3` reads *"xstock_spot **VTS** evaluation cycle"*; `:28` *"Active-trading dispatch is separately wired via signal-orchestrator."* Its active hand-off is `dispatchXstockActiveSignal` at **`:1134`** — fire-and-forget onto the orchestrator, which reaches **the same `:3487`**. **It cannot reach `_processPendingMaker` at `:1252`.**
- **EXCLUDED-AND-WHY, per A1's own standard:** `vts-runner.ts:2058` / `:2987` / `:4148` match the pending-maker shape and are the **crypto VTS** lane — same exclusion, same reason, recorded rather than silently dropped.
⇒ **ONE creator, ONE processor.**
★ **THE PER-BRANCH PRODUCER TABLE (P2) SURVIVES ON A DIFFERENT MECHANISM, AND THE SUBSTITUTION IS THE POINT:** xStock **active** positions do exist and take the **`:1140` `kraken_equities_ws`** branch **inside the same evaluation loop** as crypto. The table is still load-bearing — but because **ONE loop serves TWO feeds**, not because two creators feed one processor. ⛔ **A conclusion resting on a false premise is not a surviving conclusion, it is a coincidence** — so the mechanism is replaced here rather than the conclusion being waved through.
⚠️ **Second wrong-lane finding out of this one file — Langston's own on `#675`, retracted 08-10, now mine in reverse.**
`MISTAKE: wrong-object [B-EXIT-PROVENANCE] — cited eval-cycle.ts as an active-lane creator; it is the VTS lane, zero active-position writes.`

### A3 · ⛔ Who **DELETES** an active position? **SEVEN SITES — the highest-yield question, and it settles BLOCKER-3 beyond the close path.**
`routes.ts:3522` · `routes.ts:12916` · `routes.ts:13015` · `active-engine-service.ts:851` (orphan sweep) · `active-execution-engine.ts:1010` (the maker DROP branch) · `active-execution-engine.ts:2206` · `active-portfolio-manager.ts:651`
⇒ **provenance written to `active_open_positions` is destroyed from SEVEN independent paths, not merely "at close."** Langston's blocker said the row is deleted; **the census says it is deleted by seven callers including an orphan sweep that runs on a timer.** ⇒ **`closed_trades` as the sole target is not a preference, it is the only durable option.**

### A4 · Who **SCHEDULES** work against pending makers?
`_processPendingMaker` — declared `:970`, **called exactly ONCE, at `:1252`** (confirmed; a required third parameter therefore breaks nothing).
The **pure** `evaluatePendingMaker` has **THREE** call sites: `:984` (inside the processor), ★ **`:1358` — the resting-maker EXIT, which is the `:1364` close site**, and `vts-runner.ts:2958` (the VTS pre-pass).
⇒ **no second scheduler over the same component; no mutual-exclusion check required.**

### A5 · Who **WRITES** the exit provenance column today? ⛔ **NOBODY — THERE IS NO COLUMN.**
**My first answer named `active-execution-engine.ts:1758`. That is a LOG LINE, not a writer.** Verified at the ref: `:1751-1762` is `console.log('[B8.PNL][CLOSE_ATTEMPT]', JSON.stringify({…}))`, and `exitPriceSource: priceSource ?? 'unknown'` at `:1758` is a **field of that JSON payload**. `:1884` is the same shape inside `[B8.PNL][CLOSE_ANOMALY]`.
- **`exitProvenance` and `exit_price_source` — ZERO hits tree-wide** (`server/` + `shared/`, tests excluded).
- **`closed_trades` carries NO exit price-source column** — read at `shared/schema.ts:1671` onward.
- **The ONLY persisted exit provenance at this ref is `stateSnapshot.priceSource` at `:1977`**, inside the B70 `archiveExitDecision` enqueue — **a JSONB field on the exit-decision ARCHIVE, not on the trade record**. It is **bare** (no `?? 'unknown'`) while `priceSource` is **optional** at `:1731`, so it lands `undefined` when unset — never the string `'unknown'`.
⇒ ⛔ **THE `?? 'unknown'` MECHANISM CLAIM WAS FALSE: nothing reaches a column there.** ⇒ **THIS BATCH CREATES THE DURABLE EXIT PROVENANCE; IT DOES NOT REPAIR AN EXISTING WRITER.** That is a materially different batch — a new column and its migration are in scope, and **P5/P6 are re-anchored below onto A6 rather than onto a writer that does not exist.**
★ **Same shape as A2, one section apart: correct check, wrong object.**
`MISTAKE: wrong-object [B-EXIT-PROVENANCE] — cited a console.log field as the sole provenance writer; no such column exists.`

### A6 · ⛔ Who **WRITES `closed_trades` ON A CLOSE** — the question A5 should have asked. **A FIFTH CLOSE PATH, AND IT DISCARDS THE PROVENANCE.**
**`active-portfolio-manager.ts:587 closeAllPositions()` never calls `closePosition`.** It resolves a price source **itself** (`:604` `'entry_fallback'`, `:609` `liveQuote.source`), `console.log`s it at `:616` — then writes `storage.updateClosedTrade` at **`:623`** with `exitPrice` / `pnl` / `pnlPercent` / `closeReason` / `closedAt` and **no source field at all**, and deletes at `:651` (**A3's seventh deleter — the same site surfacing in two censuses**).
⇒ **Since A3 makes `closed_trades` the sole durable target, a writer to that table that COMPUTES the provenance and drops it on the floor is in scope BY DEFINITION** — and a fence scoped to the force-close entrypoints cannot see it. ⇒ **FIVE close paths, not four: `:1443` taker · `:1364` resting-maker · `:821` forceClose · `:623` closeAll · plus the maker DROP at `:1005` (`never_filled`).**
**Langston's find. Verified independently at the ref before acceptance, per this step's own standard.**

## B. SIM READ (mandatory)
`SYSTEM_IMPACT_MAP.md:110` — **P19-B7.2c is recorded as "a NEW cross-cutting position lifecycle STATE, not a new singleton."** `:126` — P19-B7.2d joined **the xStock VTS lane to the SAME lifecycle**. ⛔ **This line is what I mis-read into A2's "two creators": the SIM is describing the VTS lane joining the pending-maker LIFECYCLE, which is true, and says nothing about the ACTIVE lane creating a position. A document corroborating the wrong half of a claim reads exactly like corroboration.** `:131` — P19-B8.6 added **the maker TARGET-exit rest lifecycle**, which is the `:1364` site.
⚠️ **GOVERNANCE GAP, FLAGGED per this step's rule:** the SIM records the *state* and its lifecycle but **is silent on where that lifecycle's PROVENANCE is persisted** — which is exactly the hole BLOCKER-3 found. **The SIM entry is owed at Step 10 and is named here so it is not discovered at close.**

## C. LEDGER CHECK (§9.5(b-ii)) — AND IT SURFACED MY OWN PRIOR FINDING
`#532` (duplicate scheduler) — **not this component**; its defect is closed. `BATCH_CATALOG:416` P19-B7.2c — the lifecycle's own batch, **architecture class**.
★★ **`RUNNING_ISSUES:3030`, MY OWN ADDENDUM OF 2026-08-23, and it reframes this leg:** *"the maker ENTRY leg fills iff `currentPrice <= limit`, and `active-execution-engine.ts:1252` feeds `_processPendingMaker` **the same book-derived midpoint** that `#741` shows was pushed UP by ghost bids… a too-high mid would make a resting BUY fill LATE or not at all ⇒ maker entries were SUPPRESSED."*
⇒ **THE MAKER LEG IS NOT MERELY ANOTHER COHORT TO STAMP. Its FILL RATE ITSELF may have been distorted by the defect this arc exists to fix, and there is currently NO instrument on it.** The `observedAtMs` + `producer` stamp at `:990` **is** that instrument.
⚠️ **And the honest limit, already Langston-corrected on that entry: the DIRECTION and MAGNITUDE of the bias are UNKNOWN.** The stamp makes it measurable **going forward**; it does not recover the past.

## D. PROVENANCE READ (§9.5(b)) — ORIGINAL INTENT
**Introducing commit `b48aef51f`, 2026-07-02, quoted verbatim:**
> *"Kyle-simplified model (2026-07-02): maker-chosen promotion -> PENDING open trade holding a slot; fills ONLY on honest side-aware trade-through; hard timeout (`maker_max_pending_ms`, ~1h) = DROPPED, period (no convert)."*
> *"NEW pure `server/core/trading/pending-maker-logic.ts` shared by BOTH engines (paper monitor pre-pass + VTS resolve pre-pass) — **parity by construction**."*

★ **DISPOSITION (1) — STILL RELEVANT AND CORRECT.** The intent was that the fill **DECISION** be shared for parity. **This batch adds provenance CAPTURE and must not disturb that:** the pure `evaluatePendingMaker` is **not touched**, so parity-by-construction survives. ⇒ **the third parameter goes on the ENGINE's `_processPendingMaker`, never on the shared pure function** — putting it there would fork the very parity the original design bought.
✅ **`bridge/canonical/` consulted: NO coverage of the pending-maker lifecycle** — it is a 2026-07 construct, post-dating the corpus. **Recorded as a finding per the rule, not as an absence of obligation.**

## E. THE PLAN — every item back-references the finding it falls out of

| # | change | falls out of | note |
|---|---|---|---|
| **P1** | **Hoist** `let priceProducer: PriceProducer;` + `let priceObservedAtMs: number \| null;` beside `priceSource` at `:1057`; assign at all three resolution sites | **A4** (one processor, one call site) + scope **R6-2** | the DECLARATION site is named, not just the call site — the omission BLOCKER-3 found on the target table |
| **P2** | Per-branch assignment: `:1172` **carries** `priceResult.producer` / `.observedAt` · `:1140` literals the producer, carries **`_eqTick.tsMs`** · `:1201` literals, `observedAtMs` **NULL** | **A2** (ONE loop, TWO feeds) + **R6-3** | ★ **A2-corrected is why this table is load-bearing rather than tidy: xStock active positions take the `:1140` branch in the SAME loop, so one literal would still mislabel an entire asset class** |
| **P3** | Pass at **`:1252`, `:1364`, `:1443`** | **A4** (three `evaluatePendingMaker` sites; `:1358`→`:1364` is the exit) + **R7-2** | `:821` is outside the loop and is **not** covered — see P6 |
| **P4** | **Fill-branch durable write at `:990`**: `tradeId` from `position.metadata` → `storage.updateClosedTrade`, mirroring the DROP branch at `:1004-1009`; `entry_book_age_ms` **NULL by construction** with a column comment | **A3** (seven deleters ⇒ the active row cannot hold it) + **R5-2** + **CONDITION-2** | the route is **proven** — the drop branch already uses it. ⛔ **CONDITION-2 ACCEPTED: the fill branch MUST mirror the drop branch's `if (tradeId)` guard AND its explicit absence-log (`:1004-1009` guard, `:1011` log).** A silent skip makes the fill-rate instrument show a gap **indistinguishable from a non-fill** — the `#546` shape landing on the one instrument **C** says we do not have |
| **P5** | `exitProvenance` gains `producer`; `priceAgeMs` → **`tickCadenceMs`**; `observedAtMs` added; **`diffMs` forbidden on every branch** | **A5-corrected** (NO column exists ⇒ this CREATES it) + **R7-1/R7-3** | ⛔ **RE-ANCHORED: P5 now ships a NEW `closed_trades` column + migration, not an edit to an existing writer.** The rename is half the prohibition — the old name was the invitation |
| **P6** | **OBJ-5 fence keys on the ENUMERATED vocabulary**, not on non-null; covers `:821` and **`active-portfolio-manager.ts:323`/`:338`** | **A6** (five close paths) + **R7-4** + **CONDITION-1** | `:805` defaults to `'manual_stop'` ⇒ a null-only fence passes a close **condition** as a provenance. ⛔ **CONDITION-1 DISPOSED HERE, NOT AT STEP 4: `apm:338` passes a COMPOSED string `` `manual_stop_${priceResult.source}` ``, which an enumerated-vocabulary fence rejects outright. DECISION: split at the call site** — persist the producer in the provenance column and the close condition in `closeReason`, where it already belongs. **Widening the vocabulary to admit a prefix would re-open the exact door OBJ-5 exists to shut** |
| **P7** | **Do NOT touch `core/trading/pending-maker-logic.ts`** | ★ **D** (provenance: *"shared by BOTH engines — parity by construction"*) | ⛔ **an explicit non-change, recorded so a later implementer does not "tidy" the parameter onto the shared pure function and fork the parity** |
| **P8** | SIM entry for the pending-maker lifecycle's **provenance persistence** | **B** (SIM records the state, is silent on where provenance lives) | owed at Step 10, named now |
| ★ **P9** | **`closeAllPositions` `:623` persists the source it already computes** at `:604`/`:609` (today it only logs it at `:616`) | ★ **A6** (fifth close path, writes `closed_trades`, drops the value) | **the cheapest item in the batch — the value is already in a local variable one line above the write.** ⛔ **Without it the fence is green on a path that silently writes NULL, which is `#546` inside the instrument built to prevent `#546`** |

⛔ **NOTHING IN THIS PLAN IS `UNAUDITED`.** Every row cites a finding in A-D. **P7 is a deliberate non-change and is listed precisely so its absence from the diff is not read as an oversight.**

## F. RISKS, NAMED

1. ⚠️ **The stamp does not recover the past.** Per **C**, the maker fill rate may itself have been distorted, and **direction and magnitude remain UNKNOWN**. This batch makes it measurable **forward only**. **Any later claim about the historical maker rate must not lean on this stamp.**
2. ⚠️ **`:821` remains uncovered by the hoist by design** — it is outside the evaluation loop. **P6 handles it at the FENCE rather than by threading a parameter into a force-close path**, because a force-close is precisely where a partially-wired stamp would be least trustworthy.
3. ⚠️ **ONE creator today (A2-corrected) is a weaker guarantee than it sounds, not a stronger one.** The stamp rides the per-branch table inside one loop; **a future SECOND creator inherits it silently — correctly if it routes through `:3487`, wrongly if it does not.** The per-branch table is the only thing standing between those outcomes. **A second active creator is a scope trigger, not a free extension.**
4. ⚠️ **THREE OF THE FIVE FINDINGS THIS PLAN HANGS OFF WERE WRONG ON FIRST DERIVATION (A2, A5, and A6 missed entirely) — all three the same shape: the check was right and the OBJECT was wrong.** The design conclusions survived because they were load-bearing on the mechanism rather than on the citation, **which is luck, not method.** ⛔ **At Step 3 every `file:line` in this plan is re-read at the ref before it is edited — none is carried from this document on trust.**

## G. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The live position record — where I had originally planned to write down which price source drove a trade — is **deleted from seven different places**, including a cleanup timer, so anything written there is gone. It has to go on the permanent trade record instead. **And there is no such field on the permanent record today: this batch creates one.** My first pass said we already had one and just needed to fix it — that was wrong, and it makes this a bigger, cleaner job than I described.

**Three of my five findings were wrong the first time, and the review caught all three.** I named the wrong part of the system as the second place that creates resting orders (it was the learning system, not the trading one); I named a line that only *prints* a value as the place that *saves* it; and I missed an entire fifth way a trade can be closed — one that works out the price source, prints it, and then throws it away one line before saving the trade. **Every one was the same mistake: the right question asked of the wrong thing.** The design held up, but it held up for reasons that turned out not to be the ones I gave, so I have replaced the reasons rather than keeping the conclusions on trust.

**The most useful thing the audit found was my own note from three days ago:** the resting-order fill decision runs on the very price the original defect distorted, so **the fill rate itself may be wrong**, and we have no instrument on it. The stamp is that instrument. It only works going forward — it cannot recover what already happened.

**One deliberate non-change**, written down so it isn't mistaken for an omission: the shared decision logic used by both engines stays untouched, because it was built shared *on purpose* to keep the two engines in step.
