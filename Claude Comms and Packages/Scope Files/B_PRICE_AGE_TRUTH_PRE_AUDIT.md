# B-PRICE-AGE-TRUTH — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2)

**Batch:** `B-PRICE-AGE-TRUTH` (`#951`) · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class**: architecture
**Scope approved** by Langston at `ed2413924` with **7 conditions**, all applied in scope §7. **This document is written under them.**
**Audit performed** 2026-08-30/31 · **all code citations re-derived at `origin/migration/aws-supabase`.**

---

# 0. ⛔ PREVIOUSLY STATED vs NOW — EVERY NUMBER THAT MOVED SINCE THE SCOPE

> **PREVIOUSLY STATED: this batch gates THREE downstream batches. NOW: TWO (`P1`, `F-C`). REASON:** Langston's same-day plan ruling records `F-G-2` as **DECOUPLED with a design carve-out**, not gated (scope §7.4).
> **PREVIOUSLY STATED: `isKrakenVenueSource` at `:151`. NOW: `:224`. REASON:** `:151` is `toCachedProducer`, a different function. **The `SYSTEM_IMPACT_MAP` carried the same wrong number and is corrected in the same commit.**
> ⛔ **PREVIOUSLY STATED: ~843 laundering events/day. NOW: WITHDRAWN ENTIRELY — no daily rate is claimed. REASON: the events occupy a 3.5-minute burst, not the 95.7-minute window I divided by (§F1). This figure reached Kyle and is corrected to him.**
> **SUPERSEDED — ~843 laundering events/day. NOW: ~843 is the OUTERMOST of three nested sets and overstates the trading delta. REASON:** the counter fires above the `cached == null` check (condition 1). **The innermost set is measured in §2.3 and is far smaller.**
> **PREVIOUSLY STATED (OBJ-4 falsifier): "a row whose `observedAt` post-dates its own `cachedAt`". NOW: WITHDRAWN — satisfied by construction. REASON:** `:483-484` writes `observedAt` then `cachedAt` in one literal, so the relation holds on every path pre-fix. **Replaced with re-serve monotonicity.**
> **PREVIOUSLY STATED: xStock coverage is "unknown, market shut". NOW: xStock CANNOT reach the branch, structurally. REASON:** the xstock gate at `:513` returns above the `:540` call.

---

# PART A — THE AUDIT

## A1. SOURCE 1 — THE CODE, AT THE REF

**The defect, both halves, verified at `origin/migration/aws-supabase`:**
- **`:627-631`** `fetchFromKrakenRest` rate-limiter branch → `return cached?.price ?? null` — **a bare `number`; `cached.observedAt` is discarded.**
- **`:546-548`** caller → `source:'kraken_rest', producer:'kraken_rest_poller', observedAt: Date.now()` with the comment *"a genuine venue read: observed now"*.
- **`:566-571`** the honest contrast — **the same cache row**, returned as `source:'last_known_good'` with `observedAt: cached.observedAt // #743: carried through, NOT refreshed`.
⇒ **The row HAS the age. The branch discards it.**

**A1.1 — THE GUARD AND THE CAST (condition 5).**
The cache write at `:474-484` is preceded by a **real runtime guard at `:467`**: `if (quote && quote.price !== null && quote.source !== 'no_reliable_price')`.
⛔ **THAT GUARD DOES NOT VALIDATE THE SOURCE UNION.** It excludes exactly one literal. The write then does `source: quote.source as CachedPrice['source']` (`:478`) — **an `as` cast, which will silently accept a literal the type does not list.**
⇒ ⛔ **BINDING ON THE PLAN: a new `source` literal MUST be added to `CachedPrice['source']` (`:211` — ⛔ cited as `:210` three times, corrected per §E11), or the cast admits it silently and the cache holds a value the type says is impossible.**

**A1.2 — `CachedPrice` IS FILE-LOCAL, WHICH BOUNDS THE TYPE CHANGE.**
> ⛔⛔ **OVERTURNED IN PART — SEE §E1/§E2. The union escapes the file THREE ways: an exported signature, a SECOND union (`PriceQuote:195`) that must move with it, and a SUBSTRING matcher that classifies by name.**
Two interfaces share the name: `live-pricing-adapter.ts:207 interface CachedPrice` (**no `export`**) and `price-cache.ts:41 export interface CachedPrice`. **They are different types in different modules.** ⇒ **extending the adapter's union is structurally a one-file change** and cannot reach `vts-runner`/`signal-orchestrator`, which import the *other* one.
**Current union (`:211`), six literals:** `'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good'`.
⚠️ **NOT the same enumeration as the gate's.** `isKrakenVenueSource` (`:224`) enumerates the *venue* literals — condition 10's "three literals". **Two different lists; do not conflate them.**

**A1.3 — `toCachedProducer`'s NULL ARM IS THE TRAP (condition 5), CONFIRMED.**
`:471-473` — `const _cachedProducer = toCachedProducer(quote.producer); if (_cachedProducer !== null) { …set… }`.
⇒ ⛔ **A new producer mapped to `null` SUPPRESSES THE CACHE WRITE ENTIRELY** — which would *incidentally* make the new provenance never persist, satisfying a naive OBJ-4 while **breaking re-serve**. **Placement is an explicit plan decision (P3), never a default.**

**A1.4 — ⛔ A THIRD CITATION-DRIFT INSTANCE, AND IT CARRIES A GENERALISABLE LESSON.**
The **header** comment at `:143-150` says *"`:311` already carries `quote.source as CachedPrice['source']`"* and *"the runtime guard at `:306`"*. **Measured: the only such cast is at `:478`; `:306` is `this.useMockMode = mockMode` and `:311` is a `console.log`.** Both citations are stale by ~160 lines.
✅ **The INLINE comment at `:468-471`, same batch, same author, says *"the runtime guard **above**"* — and is still correct.**
⇒ ★★ **THE RELATIVE REFERENCE SURVIVED THE FILE GROWING; THE ABSOLUTE LINE NUMBERS DID NOT.** *(Third drift instance today, after my own scope and the SIM.)* **Binding on this batch's own comments: reference by name or by "above/below", not by line number.**

## A2. SOURCE 2 — RUNTIME LOGS + DATABASE

**A2.1 — THE THREE NESTED SETS (condition 1), each measured or bounded.**
> ⛔⛔ **THE RATE IN THIS TABLE IS WITHDRAWN — SEE §F1. The 56 events occupy 3.5 MINUTES, not 95.7; I divided a burst by the whole capture window. "0.59/min" and "~843/day" are wrong by ~27×. The COUNTS stand; the RATE does not. And §F3: the "positive control" in this section matched a different string than claimed.**
**Window: PM2 log, `2026-08-30 18:22:26 → 19:58:05` = 95.7 min, 36,728 lines.**

| set | measurement | instrument |
|---|---|---|
| **1 — branch taken** | **56** across **5 symbols** (`ETH/USD` 12 · `XRP/USD` 11 · `SOL/USD` 11 · `BTC/USD` 11 · `ADA/USD` 11) ⇒ 0.59/min | `[8.8.5][REST_BLOCKED]` |
| **2 — laundered quote produced** | ⭐ **56 of 56.** `price=none` occurrences: **0** | the log line prints `cached?.price ?? 'none'`, so it **records the `cached == null` case directly** |
| **3 — consumed at an exit decision** | ⭐ **BOUNDED ABOVE and small — see A2.2** | position + close overlap |

✅ **Positive control:** `REST_FALLBACK` (the *allowed* leg) = **19** in the same window ⇒ the instrument distinguishes the two legs rather than matching everything.
⚠️ **Set 1 = Set 2 in this window, but the nesting is structurally real** — `incrementRestFallbackBlocked()` fires at `:630`, BELOW the `cached` read at `:628` but ABOVE the `return` at `:631` (⛔ **this sentence said "above the `cached` read" and was INVERTED — see §E6; the structural point is unchanged**), so a cold-start/post-restart window would separate them. **Langston's correction stands as a structural point even though this window shows no divergence.**
⚠️ **The "~843/day" figure is an EXTRAPOLATION from 95.7 minutes on a Saturday evening, not a measurement.** Labelled as such.

**A2.2 — ⭐ THE INNERMOST SET IS SMALL, AND THIS IS THE FINDING THAT SHOULD DRIVE THE DECISION.**
> ✅ **CORROBORATED BY A SECOND, INDEPENDENT INSTRUMENT — SEE §D3: `exit_price_producer = 'kraken_rest_poller'` is **0**, against a positive control of 26 stamped rows.**
The laundered value can only reach an exit decision if a position is **open on that symbol**.
- **`active_open_positions` right now: 2, BOTH xStock** (`BABA/USD`, `PLTR/USD`). **Crypto open positions: 0.**
- **The five laundered symbols' share of all crypto closes:** **19 of 420 all-time = 4.5%** (`XRP/USD` 9 · `SOL/USD` 5 · `ETH/USD` 4 · `ADA/USD` 1 · **`BTC/USD` 0**). **Last 30 days: 4 closes.**
- **Control: 420 crypto closes across 104 distinct symbols** ⇒ the instrument finds closes readily; the small number is a measurement, not an empty read.
⇒ ⭐⭐ **THE COST OF THE RELABEL IS CURRENTLY VERY LOW: the symbols being laundered are the heavily-polled majors, and they are NOT the symbols we actually trade.**
⇒ ★★ **THAT IS AN ARGUMENT FOR SHIPPING NOW, NOT LATER** — the fix is cheapest precisely while the affected population is small.
⛔ **AND IT IS GROWING: `BTC/USD` has 0 closes all-time because it only became evaluable at 16:36Z on 2026-08-30 (`B-SCANNER-EGRESS-NORMALISE`). My previous batch added a symbol to this batch's population.**

**A2.3 — ⚠️ CONDITION 2's COLUMN (2) IS *NOT* DISCHARGED HERE, AND I AM SAYING SO RATHER THAN GLOSSING IT.**
Langston requires a second column: **whether a concurrent WS-write gap existed on that symbol during the `REST_BLOCKED` burst.** I have **not** measured it. The PM2 window shows the REST side but I have not established a per-symbol WS-write timeline, and **inferring "WS was quiet" from the absence of a WS log line would be exactly the instrument-reach error this batch is about.**
⇒ **PLAN ITEM P6 carries it, and it is a PRECONDITION of the relabel (P2), not of the carry (P1).**

## A3. SOURCE 3 — `SYSTEM_IMPACT_MAP.md`, PER COMPONENT
- **The gate**: SIM states *"the engine's actionable gate is `isKrakenVenueSource(source)` … it reads `source` and NEVER `producer`. A future change that makes any gate read `producer` re-arms it."* ⇒ **binding: this batch achieves non-actionability via a new `source` literal and never by touching the gate.**
- ⛔ **THE SIM'S OWN CITATION FOR THAT GATE WAS `:151` — `toCachedProducer`, the cache-suppression helper. Corrected in this batch's commit**, because a reader following it to check the gate would have read the suppressor instead.
- **Both caches are documented separately** (`price-cache.ts` at SIM `:370`, exports at `:1187`) — see A5.

## A4. SOURCE 4 — `SYSTEM_MANUAL.md`
- **§4664 documents the two-field model** and states `price_producer` *"is deliberately NOT consulted by any gate, so widening it can never change a trading decision."* ✅ **Consistent with the plan: the producer token is free; the behaviour change rides on `source`.**
- **§4015** records the consumer: *"gets live price via `livePricingAdapter.getPriceWithFallback()` (5s staleness guard)"*.
- ⚠️ **GOVERNANCE GAP, FLAGGED: the System Manual is SILENT on the rate-limited re-serve leg.** It documents four stale-price legs' provenance and not the fifth. **Same blind spot as the code census — and the same shape.**

## A5. SOURCE 5 — LEDGER, BATCH REPORTS, AND THE PRE-GOVERNANCE ARCHIVE
- **`#951`** is this batch (mine). **`#743`** is adjacent — boundary held in scope §5. **`#742`** is the v1 residue, unrelated.
> ⛔⛔ **A5's "sole provenance" CLAIM IS FALSE — SEE §H3. `ACTIVE_PATH_FLOW.md:316-317`, a document I OWN, already documented this defect in full. I ran a six-source audit and did not read my own map.**
- ⛔ **`CHANGES_AND_FIXES.md` has NO record of the rate limiter under its own phase tag** — the only `8.8.5` hit is a WebSocket ping line (`:1322`). **The branch's sole provenance is the git commit.**
- **Pre-governance archive (71 files):** `MARKET_DATA_INTEGRATION_AND_CACHING_REPORT.md` covers a **CoinGecko-primary, Kraken-fallback, 60-second display cache** — **a different, since-deleted layer** (P19-B8.9 removed the CoinGecko/Binance legs). ⇒ **NO COVERAGE of this branch. Recorded as a finding, per the recording rule.**

## A6. SOURCE 6 — `bridge/canonical/` — AND IT REFRAMES THE COMPONENT
`DawnTrader_System_Architecture_Execution_Flow.md`:
> `:194` **"Price Cache | `server/services/price-cache.ts` | Unified rate-governed cache (4 buckets)"**
> `:257` **"The Price Cache is the single source of truth for all price data, consolidating multiple sources with rate limiting."**
> `:633` **"All pricing from unified Price Cache (no direct Kraken calls)"**

⇒ ★★ **THE ORIGINAL INTENT WAS *ONE* UNIFIED RATE-GOVERNED CACHE, AS SINGLE SOURCE OF TRUTH, WITH NO DIRECT KRAKEN CALLS. TODAY THERE ARE TWO CACHES, AND THE SECOND ONE MAKES DIRECT KRAKEN REST CALLS WITH ITS OWN RATE LIMITER — WHICH IS THE BRANCH THIS BATCH IS ABOUT.**
⚠️ **STATED CORRECTLY: the canonical corpus is NOT current-state truth and the architecture has changed deliberately since. This is NOT a claim that the divergence is a defect.** ⇒ **What IS a finding: the divergence is not recorded as a DECISION anywhere I searched** (`RUNNING_ISSUES`, `BATCH_CATALOG`, `SIM`). **The SIM documents both caches and never says why there are two.**
➕ **§9.4 DISPOSITION — NOT folded in. Own item: `#970` / `B-TWO-CACHE-INTENT`, owner CC-C, placed at plan row 3b.l, after 3b.k.** ⛔ **It needs the three-outcome read before any fix: two caches may be a correct, deliberate split, and re-scoping a decision as a defect is worse than no finding.**

## A7. §9.5(a) CENSUS + ENTRY-POINT ENUMERATION
**On `this.priceCache` (`:258`, `private Map<string, CachedPrice>`):**
| role | count | sites |
|---|---|---|
| **writers** | **3** | `:474`, `:907`, `:989` |
| **readers** | **11** | `:374, :404, :514, :560, :593, :628, :719, :980, :1060, :1113, :1175` |
| **deleters/clearers** | **2** | `:365` delete, `:1205` clear |
⛔ **THE NAME TRAP, RESOLVED: a bare `priceCache.*` appears in `vts-runner`, `signal-orchestrator`, `rtb-refresh-service`, `routes.ts`, `m5d`/`m5e-validation-service`, `trading-state-sync`, `vts-audit` — those are the OTHER cache (`import { priceCache } from './price-cache.js'`) and are NOT in this blast radius.** Because the adapter's field is `private`, every access site is in-file.

**ENTRY POINTS, repo-wide, tests excluded — and each grep returned hits, so these are measurements, not empty reads:**
- **Schedulers: EXACTLY ONE** — `setInterval` at `:316`.
- **Bootstrap callers: EXACTLY ONE** — `server/index.ts:1027` `livePricingAdapter.start(useMockMode)`.
- **Instances: EXACTLY ONE** — `:1232` `export const livePricingAdapter = new LivePricingAdapter()` (module singleton).
⇒ **One instance, one scheduler, one bootstrap ⇒ no mutual-exclusion check required.**
> ⛔ **INFERENCE WITHDRAWN — SEE §E4. The count is right; the conclusion does not follow. The on-demand path reaches the same writer from EIGHT external call sites and can race the timer.**
- **`fetchFromKrakenRest`: `private`, EXACTLY ONE call site (`:540`), 0 test references.**
> ⛔ **"0 test references" WAS A NAME SEARCH — SEE §E5. A test NAMES this branch and PINS the token this batch intends to change.**
- **`incrementRestFallbackBlocked`: EXACTLY ONE writer (`:630`)** ⇒ the counter is cleanly attributable.

⛔ **§9.5(a-ii) deletion-time state-write census: N/A — THIS BATCH DELETES NOTHING.** Stated rather than skipped.

---

# PART B — THE IMPLEMENTATION PLAN
> ⛔⛔ **SUPERSEDED BY PART B2 (below), rebuilt under Langston's four Step-2 blockers. Retained as the record of what was sent back. Where they differ, B2 governs.**
**Every item back-references the audit finding it falls out of. Nothing here is `UNAUDITED`.**

| # | plan item | falls out of | verification |
|---|---|---|---|
| **P1** | **Carry the age.** `fetchFromKrakenRest`'s rate-limited branch returns the cache **row** (or `{price, observedAt}`), not a bare number; the caller propagates `observedAt` instead of stamping `Date.now()`. | **A1** | a rate-limited re-serve carries `observedAt !== Date.now()`, **against a control**: a genuine REST read in the same window whose `observedAt` IS ≈ now |
> ⛔⛔ **P2's CRITERION COULD NOT FAIL — SEE §H1. "the gate's own source list is byte-unchanged" PASSES IF P2 IS NEVER IMPLEMENTED. Replaced with the engine's own `:1277` behaviour, with a control. And P2's DOWNSTREAM was unnamed: it routes the blocked population AROUND the rate limiter.**
| **P2** | **Tell the truth in `source`** — a **new literal**, added to `CachedPrice['source']` (`:211` — ⛔ cited as `:210` three times, corrected per §E11). Non-actionability is inherited because `isKrakenVenueSource` (`:224`) does not list it. ⛔ **The gate is NOT touched.** | **A1.1, A3** | the gate's own source list is byte-unchanged in the diff |
| **P3** | **A new fifth `producer` token, with its `toCachedProducer` placement STATED.** ⛔ **It must NOT map to `null`** — that suppresses the cache write and breaks re-serve. | **A1.3** | a re-served row still appears in the cache after the change; **the falsifier is the absence of that row** |
| **P4** | **Extend the union properly, do not ride the cast.** The `as` at `:478` would admit the new literal silently. | **A1.1** | removing the new literal from `CachedPrice['source']` **must produce a compile error** — if it does not, P4 failed |
| **P5** | **OBJ-4 replacement — re-serve monotonicity.** For a symbol, `observedAt` may advance only when a genuine venue read occurred. | **§7.3 (condition 3)** | a tick logging `REST_BLOCKED` on symbol S **must not** advance S's `observedAt` |
> ⛔ **P6 HAD NO DECISION RULE — SEE §H2, where one is now pre-registered before any measurement.**
| **P6** | ⛔ **PRECONDITION OF P2, NOT OF P1: measure condition 2's column (2)** — concurrent WS-write gap per symbol during a `REST_BLOCKED` burst — **plus the AGE DISTRIBUTION of the refused population** (condition 2b). | **A2.3** | if the distribution is dominated by sub-second re-serves, **the conclusion is to pull `#743`/F-C forward, not to weaken this batch** (his ruling, adopted in advance) |
| **P7** | Comments reference **by name or "above/below", never by line number.** | **A1.4** | no absolute line citation in any comment this batch adds |

⛔ **SEQUENCING, and it is the plan's one real safety property: P1 + P3 + P5 are PROVENANCE-ONLY and change no trading decision. P2 is the only item that changes behaviour, and it is gated behind P6's measurement.** ⇒ **the batch can ship its honest-age half without waiting on the WS-gap study.**

---

# PART C — PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** When Kraken makes us wait, the system serves the last price it had and labels it as freshly read. One branch away, the same stored price is labelled honestly — so the age exists and is simply thrown away.

Three things the audit changed. **The scale is much smaller than I first said**: the five affected coins are the ones we poll hardest, not the ones we actually trade — they account for about **4.5% of all crypto trades ever**, and we hold **no** crypto positions right now. That makes this cheap to fix today and more expensive later, and **Bitcoin only joined that group yesterday** because of the previous batch. **My original success test couldn't fail**, and is replaced. And **three separate documents point at the wrong line** for the safety gate involved, including our own component map — one of which would have sent a reader to a function that does the opposite thing.

**The plan.** Carry the real age, label the price honestly, and add a distinct tag so this case is tellable apart from a genuine outage. Only one of those changes what the system trades, and it's held behind a measurement first.


---

# D. ⛔⛔ READER ROUND 1 (mode B, claim-only) — **IT CHALLENGED THE BATCH'S CENTRAL LINK AND IT WAS RIGHT. RE-DERIVED AT THE REF.**

**`REVIEWER r1: claim-only · "a rate-limited price is stamped observed-now and reaches the exit decision" · HIT ×3 · re-derived: y`**
*(Handed the claim and no objects, so it had to find its own. That is the half mode A cannot reach.)*

## D1. ⛔⛔ THE HIT THAT MATTERS — **NO GATE READS `observedAt`. THE LIVE GATE READS `cachedAt`.**
**RE-DERIVED at `origin/migration/aws-supabase`:**
- **`:1067`** — `const age = now - cached.cachedAt;` and **`:1072`** — `if (age <= this.WS_CACHE_FRESH_MS && isKrakenVenueSource(cached.source))`. ⇒ **the freshness window is computed from `cachedAt`, NOT `observedAt`.**
- **In the engine, `observedAt` is only ASSIGNED and PERSISTED** — `:1285` `priceObservedAtMs = priceResult.observedAt`, `:1378` writes it into provenance. **It is never compared to a threshold.**

⇒ ⛔ **MY SCOPE §1 SAID *"P1's guard reads `observedAt`, which is fabricated."* THAT LINK WAS TOO NARROW AND NAMED THE WRONG FIELD FOR TODAY'S CODE.**

✅ **THE CORRECTED — AND STRONGER — STATEMENT: THE LAUNDERED WRITE REFRESHES *BOTH* AGE FIELDS.** `:483-484` writes `observedAt: quote.observedAt ?? Date.now()` — and `quote.observedAt` **is** `Date.now()` from `:548` — **and** `cachedAt: Date.now()`.
⇒ ★★ **SO THE LAUNDERED ROW PASSES THE EXISTING 2-SECOND FRESHNESS GATE *AND* CARRIES A FALSE ORIGIN INTO THE PERMANENT RECORD. A future P1 is fooled whichever of the two fields it reads.** That does not depend on which field P1 picks, which is why it is the better argument.
★ **AND IT ISOLATES WHAT MAKES THE HONEST LEGS HONEST:** `cachedAt` is refreshed on **every** re-serve, honest or not (they share the `:474` writer) — **#743's own comment says so.** ⇒ **the honest legs are distinguishable ONLY by `observedAt` + `source`, and the laundered leg refreshes `observedAt` too. That is precisely what destroys the distinction.**

## D2. ✅ AND ITS COROLLARY, ADOPTED INTO THE PLAN'S SEQUENCING
The reader's third alternative state: *"fixing `observedAt` alone changes the RECORD, not the DECISION"* — because `isKrakenVenueSource` (`:224`) reads **`source`** alone.
✅ **This CONFIRMS Part B's sequencing rather than overturning it: P1/P3/P5 are provenance-only; P2 is the sole behaviour change.** ⛔ **But it sharpens the honesty requirement: P1 alone must NOT be described as fixing the exit's decision. It fixes the record and makes P1/F-C buildable. Nothing more.**

## D3. ⭐⭐ THE INNERMOST SET, MEASURED BY A SECOND INDEPENDENT INSTRUMENT THE READER NAMED — **AND IT IS ZERO**
It pointed at `closed_trades.exit_price_producer`, a column that exists for exactly this question. **MEASURED:**
| population | value |
|---|---|
| **`exit_price_producer = 'kraken_rest_poller'`** | ⭐ **0** |
| `kraken_ws_book_mid` *(crypto)* | **17** |
| `kraken_equities_ws` *(xStock)* | **9** |
| NULL — pre-deploy by design | 637 |
| total closed | 663 |

✅ **POSITIVE CONTROL: the column holds values — 26 stamped rows across two distinct producers ⇒ the instrument CAN record a producer, so the zero is a measurement and not an empty read.**
⚠️ **REACH, STATED PLAINLY: stamping began at `B-EXIT-PROVENANCE`'s deploy (2026-08-26), so the population is 26 closes over ~5 days, of which only the 17 `kraken_ws_book_mid` rows are crypto.** ⇒ **the honest claim is `0 of 17 stamped crypto closes`, which BOUNDS the rate loosely — it does not prove zero.** A 10% true rate would yield ~1.7 expected in 17.
⚠️ **Also consistent with: no crypto positions currently open, and affected positions not yet closed.**

⇒ ★★ **TWO INDEPENDENT INSTRUMENTS NOW AGREE THE INNERMOST SET IS VERY SMALL** — the symbol-overlap route (4.5% of crypto closes all-time) and the persisted-producer route (0 of 17). **They share no mechanism, which is what makes the agreement worth something.**

## D4. ⚠️ A FOURTH DRIFT INSTANCE — **`#951`'s OWN CITATIONS ARE STALE, AND THE FAILURE MODE IS SPECIFIC**
The reader measured the ledger entry's line numbers against HEAD: `#951` cites `:582-586`, `:496-505`, `:425-441`, `:1013`, `:1249`; at HEAD these are `:627-631`, `:540-549`, `:470-486`, `:1058`, `:1257`. **The adapter gained ~45 lines.**
⇒ ⛔ **A reader resolving `#951`'s numbers at HEAD lands in the wrong place and could conclude EITHER *"already fixed"* OR *"never existed."*** ✅ **Corrected in `#951` in this commit.** *(Fourth instance today, after my scope, the SIM, and the code header comment.)*

## D5. ✅ WHAT THE READER CONFIRMED INDEPENDENTLY — recorded, but NOT cited as support
⛔ **A reviewer CLEAN is not evidence and is not used as any.** Recorded only because each was independently re-derivable:
- **The two-cache separation (A7)** — and it added a mechanism I had not stated: the blocked branch **returns at `:631`, before `:704 priceCache.updateFromRest`**, so the *unified* cache never receives the laundered value. **That is a stronger containment argument than my `private`-field one.**
- **xStock structurally excluded** via the `:513` gate returning above `:540`.
- **`toCachedProducer('kraken_rest_poller')` returns non-null**, so the laundered write is **not** currently suppressed — which is what makes the P3 placement decision live rather than theoretical.

## D6. ⚠️ TWO OPEN ITEMS THE READER SURFACED THAT I AM **NOT** CLOSING
1. **`MONITOR_INTERVAL_MS` is DB-resolved** (`active-execution-engine.ts:260-262`, `active_execution.monitoring_interval_ms`) ⇒ **the engine's read cadence is not knowable from the repo.** It bears on how often a laundered row could be consumed. **Unresolved; not asserted either way.**
2. **A key-normalisation asymmetry:** `fetchPrice` writes with the raw argument (`:474`) while readers normalise (`:628`, `:1060`). **They coincide today** — `addSymbols` has no external caller and `normalizeInternal` is identity on `BASE/QUOTE` — **but nothing enforces it.** ⇒ **Recorded as a latent condition, not a finding.**


---

# E. ⛔⛔ READER ROUND 2 (mode A, object = this document) — **ELEVEN HITS. FOUR CHANGE THE PLAN. ONE IS AN INVERTED CITATION INSIDE MY OWN SECTION ABOUT CITATION DRIFT.**

**`REVIEWER r2: object (this document + the adapter at the ref) · "what other states of the world are consistent with its evidence" · HIT ×11 · re-derived: y`**

## E1. ⛔⛔ THE PLAN NAMED ONE UNION. **THERE ARE TWO, AND THE SECOND BREAKS FIVE ASSIGNMENTS.**
**RE-DERIVED:** `PriceQuote.source` (**`:195`**) = **7 members**, including `'no_reliable_price'`. `CachedPrice.source` (**`:211`**) = **6** — the same list minus that one.
⇒ ⛔ **P2/P4 as written moved only `CachedPrice`. Adding a literal there alone makes the five `cached.source → PriceQuote` assignments (`:391`, `:425`, `:1077`, `:1093`, `:1119`) non-assignable.** ✅ **BOTH unions move, or neither compiles.**
⛔ **THE CLAUSE THAT FOLLOWED HERE IS REVERTED — SEE §G1. It replaced A1.1's CORRECT guard attribution with a wrong one. The arithmetic makes the cast NECESSARY; the `:467` guard makes it SOUND. Retained below only as the record of the error:** ★ ~~And it explains why the `as` at `:478` is safe TODAY, which I had attributed to the guard alone: `PriceQuote['source']` minus `'no_reliable_price'` EQUALS `CachedPrice['source']` exactly.** The cast is currently a no-op **by arithmetic between two unions**, not by the guard. ⇒ **the correct statement of the binding: any literal added to `:195` and NOT to `:211` is admitted silently.**

## E2. ⛔⛔ THE NEW LITERAL'S **NAME** IS A BEHAVIOUR DECISION — `isRestFallbackSource` MATCHES BY **SUBSTRING**
**RE-DERIVED at `:253-254`:** `REST_FALLBACK_SOURCES = ['rest_fallback','kraken_rest','last_known_good']` and `some(s => source.includes(s))`.
⇒ ⛔⛔ **A literal named `kraken_rest_reserve` or `last_known_good_rate_limited` — the two names I would most naturally have chosen — is SILENTLY classified `rest_fallback: true`. One sharing no substring is classified `false`. The signature is `(source: string)`, so NEITHER outcome errors.**
Consumed out-of-module at `routes.ts:12220, 12754, 12842, 13026` and `active-portfolio-manager.ts:639`.
> ⛔ **OVERSTATED — SEE §G2. All five callers only interpolate the result into a `console.log`; it is never branched on, returned or persisted. This is LOG CONSISTENCY, not a behaviour gate.**
⇒ ✅ **NEW PLAN ITEM P8: the literal's name is chosen against this predicate DELIBERATELY, and the intended `isRestFallbackSource` verdict is stated and asserted in a test.** ⛔ **This is exactly the trap I was walking into.**

## E3. ⛔ MY CENSUS COUNTED `.get(` CALL SITES AND CALLED THEM READERS — **AND MY SEARCH SHAPE COULD NOT HAVE FOUND THE REST**
**Missed access sites, re-derived:** **`:418` `this.priceCache.forEach((cached, symbol) => {`** inside `getAllPrices()` — **a BULK reader of every row that ships `source`, `producer` AND `observedAt` out of the module** (consumed `server/index.ts:1100`, `routes.ts:6105`) — plus **`.size` at `:1204`, `:1214`, `:1225`** (`getCacheSize()`, consumed in `active-session-reset.ts`).
⇒ **20 access sites; my table accounted for 16.** ⛔ **My grep was `\.priceCache\.(set|get|delete|clear)` and STRUCTURALLY COULD NOT FIND `forEach`, `size` or `has`.** ★ **`:418` is material: it is a bulk reader of exactly the three fields this batch changes.**

## E4. ⛔ "ONE INSTANCE, ONE SCHEDULER ⇒ NO MUTUAL-EXCLUSION CHECK" — **THE COUNT IS RIGHT AND THE INFERENCE IS WRONG**
The cache writer at `:474` is reachable from a **second, unscheduled** path: `getPriceWithFallback` → `await this.fetchPrice(normalized)` (`:1112`) → `fetchLivePrice` → `:474`. **That path has EIGHT external call sites** (`active-execution-engine.ts:766,1257` · `active-portfolio-manager.ts:308,631` · `routes.ts:10677,12213,12748,12837,13021` · `verification-test-protocol.ts:331`).
⇒ ⛔ **The 15 s timer's fan-out and a concurrent `getPriceWithFallback` CAN both be inside `fetchPrice` for the same symbol. The entry-point census does not license the no-race conclusion, and I drew it anyway.**
⚠️ **Also: "EXACTLY ONE instance" is a CALL-SITE fact, not structural — the class is `export class LivePricingAdapter` (`:257`), so a second is constructible.**

## E5. ⛔⛔ "0 TEST REFERENCES" WAS A NAME SEARCH — **AND A TEST NAMES THIS EXACT BRANCH AND PINS THE TOKEN I INTEND TO CHANGE**
**`server/tests/unit/b-exit-provenance-fence.test.ts:244-245`** carries *"`rest_poller` has a THIRD arm — the rate-limited bare cached price, #951"*, and **`:259` asserts `expect(union).toContain("'kraken_rest_poller'")`.**
Two further suites execute the path transitively via `getPriceWithFallback` (`p19-b8-9a-source-tag-honesty.test.ts:34,44`; `p19-b8-9-venue-only-source.test.ts:77,86`).
⇒ ⚠️ **P3 states the assertion's disposition — but see §G6: it pins the token's PRESENCE, so ADDING a fifth producer leaves it green. Only a rename or removal breaks it.** ⚠️ **AND THE REACH TRAP: `tsconfig.json` excludes `**/*.test.ts`, so the TypeScript Check job does NOT type-check tests — P4's compile-error falsifier must be exercised against PRODUCTION code, or it proves nothing.**

## E6. ⛔ **AN INVERTED CITATION, IN MY SECTION ABOUT CITATIONS.**
My §A2.1 wrote *"`incrementRestFallbackBlocked()` fires at `:630` **above the `cached` read**."* **RE-DERIVED: `:628` is the `cached` read; `:630` is the counter. It fires BELOW it.**
✅ **My SCOPE said it correctly** (*"`:630`, ABOVE `return cached?.price ?? null`"* — `:631`). **The restatement flipped a true claim into a false one.**
✅ **The structural point SURVIVES and is unchanged:** the counter is **unconditional within the branch**, so it counts entries including `cached == null`. **Only my phrasing was wrong — but it was wrong in the one section arguing that citations must be checked.**

## E7. ⛔ "xStock CANNOT reach the branch, STRUCTURALLY" — **OVERSTATED. THE GATE TESTS A RESOLVER'S VERDICT, NOT THE CLASS.**
`safeResolveAssetClass` returns **`AssetClass | null`** (`shared/asset-classes.ts:820`, `:842 return null` in the catch). ⇒ **an xStock symbol that FAILS classification is `null !== 'xstock_spot'` and falls through to `:540`.**
⚠️ **`xstock_perp` is a separate active class** (`:39`, `:97-103`) and the gate tests `xstock_spot` **only**.
⛔ **AND THERE IS AN INSTRUMENT I DID NOT READ: `_classifyFallthroughCount` (`:825`) and the `[B69][CLASSIFY_FALLTHROUGH]` log (`:830`).** ⇒ **the claim is downgraded to *"no `xstock_spot`-RESOLVING symbol reaches it"*, and the fallthrough counter is added to P6.**
✅ **One point in my favour I had not made: the gate is UPSTREAM of `:540`, so the property survives a second caller of `fetchFromKrakenRest` — a stronger form than I gave.**

## E8. ⛔ "SUPPRESSES THE CACHE WRITE ENTIRELY" — **SCOPED TO ONE OF THREE WRITERS, AND THE CONSEQUENCE IS BIGGER THAN I SAID**
`updateCache` (`:891-900`) takes `producer: CachedProducer` **directly and never calls the switch**; `seedLastKnownGoodPrice` hardcodes `'entry_seed'` (`:994`). ⇒ **suppression applies to the `fetchPrice` path only** — which is the relevant one here, so the conclusion holds and the word *"entirely"* does not.
⛔ **AND THE DOWNSTREAM IS A TRADING DECISION, NOT MERELY "BREAKS RE-SERVE":** suppressed write → the row keeps ageing → `getPriceWithFallback` falls to the `:1134` last-resort re-serve tagged `last_known_good` → **fails `isKrakenVenueSource`** → direct REST → **position SKIPPED if REST also fails.** *(Chain documented in-code at `:160-165` and pinned by `b-exit-provenance-fence.test.ts:210-213`.)*

## E9. ⛔ A POSITIVE CONTROL FOR A2.1 EXISTED AND I DID NOT RUN IT
`server/services/market-data/rest-rate-limiter.ts:57`/`:64` log **`[8.8.5][RestRateLimiter] BLOCKED <symbol>: cooldown|no_tokens`** — **with the REASON** — and `:22`/`:128` keep a `blockedCount`. **`check(symbol)` has ONE caller (`:627`)** ⇒ **the two instruments must agree 1:1.** ✅ **Added to P6 as the control, and it supplies the cooldown-vs-token-exhaustion split my single count could not.**

## E10. ⛔⛔ **MY OWN MEASUREMENT DOES NOT RECONCILE WITH THE CONFIG, AND I DID NOT NOTICE**
`rest-rate-limiter.ts:45` — `perSymbolCooldownMs ?? 60000`; `live-pricing-adapter.ts:284` — `REFRESH_INTERVAL_MS = 15000`.
⇒ **A 15 s poll against a 60 s per-symbol cooldown should block roughly 3 of every 4 polls — on the order of 45/hour/symbol. I measured 56 blocks across 5 symbols in 95.7 min ≈ ONE PER SYMBOL PER 8.7 MINUTES.** ⛔ **That is roughly an order of magnitude BELOW the configured behaviour, and I reported the number without reconciling it.**
⇒ **P6 MUST reconcile it before any magnitude claim is trusted.** ★ **Either the poller does not tick every symbol every 15 s, or the cooldown is DB-overridden, or my log window is not what I think it is — and until that is settled, the 56 is a number without a mechanism.**

## E11. ✅ CITATION: the union is at **`:211`**, not `:210` (`:210` is `timestamp: string`). **Cited wrongly three times; corrected.**

## E12. ✅ WHAT THE READER CONFIRMED — recorded, NOT cited as support
The two-`CachedPrice` separation (structurally different types — `price-cache.ts:41` has `lastSource: PriceSourceTag` and **no `source` field at all**) · the `:467` guard's single-literal exclusion · the `:513` gate ordering · all three `bridge/canonical` quotes verbatim · the `CHANGES_AND_FIXES` absence, **re-run under a wider pattern than mine** (`rate.?limit|RestRateLimiter|REST_BLOCKED`) and surviving · **the client is insulated** — the server ships a precomputed boolean (`routes.ts:12392`) and no client file compares a source literal.
⚠️ **It could NOT verify anything in §A2 (PM2 + database) — no staging access.** ⇒ **every runtime number in this document remains single-sourced to me and is flagged as such for Langston.**
⚠️ **Search-reach artifact worth knowing: a SECOND copy of `routes.ts` exists at `docs/current_state/screeners_export/backend/routes.ts` and is hit by "repo-wide" greps.** It did not distort these counts.

---

## E13. ⇒ PLAN ITEMS ADDED OR CHANGED BY ROUND 2
| # | change | from |
|---|---|---|
| **P2/P4** | ⛔ **BOTH unions move** — `PriceQuote:195` **and** `CachedPrice:211` | **E1** |
| **P8 (new)** | **The literal's NAME is chosen against `isRestFallbackSource`'s SUBSTRING match, the intended verdict stated and asserted in a test** | **E2** |
| **P3** | must state the disposition of **`b-exit-provenance-fence.test.ts:259`**, which pins `'kraken_rest_poller'` | **E5** |
| **P4** | falsifier exercised against **production** code — tests are not type-checked | **E5** |
| **P6** | gains: the rate-limiter's own **reason-split** log as the 1:1 control · the `[B69][CLASSIFY_FALLTHROUGH]` counter · ⛔ **and the 60 s/15 s reconciliation, which is now a PRECONDITION of any magnitude claim** | **E9, E7, E10** |
| **P9 (new)** | **`getAllPrices()` (`:418`) ships `source`/`producer`/`observedAt` out of the module to two consumers — check both against the new literal** | **E3** |


---

# F. ✅⛔ **E10 IS RESOLVED — AND THE RESOLUTION IS THAT MY HEADLINE RATE WAS WRONG BY A FACTOR OF ~27.**

**Measured on staging after round 2 flagged the config/measurement gap. The reader could not do this — it has no staging access — so this half is mine, and the error was mine.**

## F1. ⛔⛔ THE 56 EVENTS OCCUPY **3.5 MINUTES**, NOT 95.7. I DIVIDED A BURST BY A WINDOW IT DID NOT OCCUPY.
**TRUE span of all 56 `REST_BLOCKED` events: `19:54:28 → 19:57:58` = 3 min 30 s.** The 95.7-minute figure was the span of the whole 36,728-line log capture, **not of the events in it.**
⇒ ⛔ **WITHDRAWN: "0.59/min", "35.1/hour", "~843/day".** All three divide by the wrong denominator. **The `~843/day` reached Kyle and is corrected to him directly.**
★ **The events are a BURST at the tail of the capture, so the honest position is: I CANNOT extrapolate a daily rate from one burst, and any figure that tries is manufacturing precision.**

## F2. ✅ AND WITH THE RIGHT DENOMINATOR, THE CONFIG AND THE MEASUREMENT RECONCILE **ALMOST EXACTLY**
**Within the burst: 56 blocked · 19 allowed · 75 checks total, across 5 symbols in 210 s.**
- **75 checks / 5 symbols / 210 s = one check per symbol per ~14 s.** ✅ **That is `REFRESH_INTERVAL_MS = 15000`, confirmed empirically.**
- **56 of 75 blocked = 74.7%.** ✅ **A 60 s per-symbol cooldown against a 15 s poll blocks 3 of every 4 — 75.0%.**
- **Per-symbol deltas, `BTC/USD`: 15s, 15s, 30s, 15s, 15s, 30s, 15s, 15s, 15s, 30s** — the poll cadence, with the 30s gaps being the allowed ticks.
- **The block reason is `cooldown` on all 56, `no_tokens` on ZERO** — and the log even prints `cooldown (45s remaining)`, i.e. **15 s after the last allowed call**, which is the poll interval landing inside a 60 s cooldown.
⇒ ⭐ **E10 IS CLOSED: there is no anomaly. The mechanism is exactly what the config says, and the gap was entirely my arithmetic.**

## F3. ⛔ AND MY "POSITIVE CONTROL" WAS MATCHING A DIFFERENT STRING THAN I CLAIMED
§A2.1 cited *"`REST_FALLBACK` (the allowed leg) = 19"* as the control proving the instrument distinguishes the two legs.
**RE-DERIVED: the precise pattern `[I7][REST_FALLBACK]` returns ZERO.** The 19 hits came from a loose `REST_FALLBACK` substring matching a **different** log prefix.
✅ **The REAL allowed-leg indicator is `[8.8.5][RestRateLimiter] ALLOWED <symbol>: tokens=N/10`, and it is genuinely 19 — the same number by coincidence of the burst, from a different line.**
⇒ ⛔ **The control was right about the number and wrong about the object.** ★ **A control that matches the wrong string is not a control — it is a second uncontrolled measurement wearing a control's name.** *(Same family as the `restFallbackBlocked`/`restFallbacksBlocked` one-letter miss earlier in this same audit.)*

## F4. ⭐⭐ THE RECONCILIATION INDEPENDENTLY CONFIRMS **LANGSTON'S COLUMN (2)**, WHICH I HAD TREATED AS AN UNMEASURED CHORE
If blocking is ~75% **whenever the REST leg is reached**, then the laundering rate is governed **entirely by how often the REST leg is reached at all** — and `fetchLivePrice` reaches it only when the earlier branches do not satisfy the request.
⇒ ★★ **THE FREQUENCY IS A FUNCTION OF WS QUIETNESS. THAT IS EXACTLY HIS COLUMN (2)** — *"whether there was a concurrent WS-write gap on that symbol during the `REST_BLOCKED` burst"* — **and the burst structure is positive evidence for his hypothesis that the laundered row wins precisely when WS is quiet.**
⇒ **P6 is upgraded from a chore to the batch's central measurement, and it now has a stated mechanism to test rather than a number to collect.**

## F5. ⇒ WHAT SURVIVES UNCHANGED
- **The defect itself** — the discarded `observedAt`, the `Date.now()` stamp, the refreshed `cachedAt`. **None of this rests on the rate.**
- **The innermost-set finding** — `exit_price_producer = 'kraken_rest_poller'` is **0 of 17 stamped crypto closes**, and the 4.5% symbol-overlap figure. **Neither is a per-minute rate, so neither is touched by F1.**
- **The plan's sequencing** — P1/P3/P5 provenance-only, P2 behaviour-changing and gated behind P6.
⛔ **What does NOT survive: any statement of how often this happens per day. There isn't one, and there will not be one until P6 measures the reach-rate rather than the block-rate.**


---

# G. ⛔⛔ READER ROUND 3 (mode A, object = the CORRECTED document) — **IT CAUGHT ME OVERTURNING A CORRECT STATEMENT. LOOP CLOSES AT THE 3-ROUND CAP.**

**`REVIEWER r3: object (this document + the adapter/rate-limiter/asset-classes at the ref) · "check the corrections themselves" · HIT ×9 · re-derived: y`**
⛔ **CAP REACHED. Per the rule, the FULL round record goes to Langston rather than a fourth round** — iterating to agreement selects for persistence, not truth.

## G1. ⛔⛔ **E1's STAR CLAUSE WAS BACKWARDS, AND IT "CORRECTED" A1.1 INTO AN ERROR. REVERTED.**
E1 claimed the `as` at `:478` is safe *"by arithmetic between two unions, not by the guard."* **That is inverted.**
✅ **The arithmetic is why the cast is NECESSARY** — without the assertion, `quote.source` (7 members) is **not assignable** to `CachedPrice['source']` (6) and `:478` would not compile.
✅ **What makes it SOUND AT RUNTIME is precisely the guard at `:467`**, which excludes exactly the one excess member `'no_reliable_price'`.
⇒ ⛔ **A1.1's ORIGINAL ATTRIBUTION TO THE GUARD WAS RIGHT. E1 REPLACED A CORRECT STATEMENT WITH A WRONG ONE. REVERTED to A1.1.**
★ **This is the EROSION mode the loop is warned about, caught in the act — and it is why a correction gets reviewed rather than trusted.** ✅ **E1's binding conclusion survives untouched: a literal added to `:195` and not `:211` is admitted silently.** Right conclusion, wrong reason — now corrected to the right reason.

## G2. ⛔ **E2 OVERSTATED: `isRestFallbackSource` FEEDS ONLY LOG LINES. IT IS A LOG-CONSISTENCY ITEM, NOT A BEHAVIOUR GATE.**
**All five callers traced** (`routes.ts:12220, 12754, 12842, 13026`; `active-portfolio-manager.ts:639`): every one is `fallbackType = isRestFallbackSource(...) ? 'rest_fallback' : 'none'`, and `fallbackType` is **only interpolated into a `console.log`** (`:12228`, `:12759`, `:12847`, `:13031`, `apm:644`). **Never branched on, never returned, never persisted.**
⇒ ⛔ **A misclassification changes ONE WORD IN FIVE LOG LINES. My "THE NAME IS A BEHAVIOUR DECISION" is withdrawn.**
⚠️ **And the trap may be a false alarm on its merits: for a rate-limited re-serve, `rest_fallback: true` is arguably the CORRECT verdict** — the substring would have produced the right answer by accident.
✅ **P8 SURVIVES BUT IS RE-AIMED AND BROADENED:** it is log consistency, **and there is a SECOND substring matcher I missed** — `routes.ts:12336` `priceSource.includes('kraken_ws') ? 'WS' : …`, **shipped to the client at `:12394`.** A repo sweep finds exactly these two. **P8 names both.**

## G3. ⛔ **E10's EXPECTED FIGURE WAS WRONG BY 4×, AND TWO OF MY THREE HYPOTHESES ARE REFUTED FROM THE REPO**
- ⛔ **My "~45/hour/symbol" is wrong.** At `P=15s`, `C=60s`: **3 blocks per 4 checks × 240 checks/hour = 180 blocks/hour/symbol.** ⇒ expected **287/symbol, 1,435 total** over 95.7 min against 56 observed ⇒ **the gap is ~25.6×, not "roughly an order of magnitude."**
- ✅ **"the cooldown is DB-overridden" — REFUTED.** `rest-rate-limiter.ts:128` is the **only** `new RestRateLimiter()` in the repo and is called with **no options**; `60000` is a literal default. Same for `REFRESH_INTERVAL_MS` — no DB read, no env var.
- ✅ **"the poller does not tick every symbol every 15 s" — REFUTED, and elegantly:** for any constant period `P`, blocks are `(W/P)(1 − 1/⌈C/P⌉)`; solving for 11.2 blocks/symbol gives `P ≈ 256/342/384 s`, **each contradicting its own bracket**, and **any `P > 60 s` yields ZERO cooldown blocks.** ⇒ **a slower poller makes blocks VANISH, not shrink.**
⇒ ⭐⭐ **ONLY MY THIRD HYPOTHESIS SURVIVES — the measured population is not 95.7 minutes of poller operation. AND ROUND 3 DERIVES ITS DURATION INDEPENDENTLY: 56 ÷ (5 × 3/min) = 3.73 min, and 19 ÷ (5 × 1/min) = 3.8 min — BOTH LEGS AGREE.**
✅ **THAT INDEPENDENTLY CONFIRMS §F1's 3.5 minutes, reached by a different route entirely** (F1 read the timestamps; G3 derives it from the config arithmetic). **Two methods, no shared mechanism, same answer.**

## G4. ⭐⭐ **A FAR BETTER INSTRUMENT EXISTS AND NOBODY NAMED IT — IT REMOVES THE LOG-CAPTURE DEPENDENCY ENTIRELY**
**`GET /api/diagnostics/8.8.5/rate-limiter`** (`routes.ts:10907-10924`) returns `getStats()`: **cumulative process-lifetime `allowedCount` and `blockedCount`** (`rest-rate-limiter.ts:31-32`) plus **`perSymbolCooldowns`** (`lastFetchTime.size` — how many distinct symbols have ever been allowed).
⇒ **Two hits separated by a known interval give the TRUE block rate with NO dependence on log capture** — which is the exact weakness that produced §F1's error. ✅ **P6 uses the endpoint; the log grep becomes the cross-check, not the primary.**
✅ **And `perSymbolCooldowns` directly answers a question my census got wrong:** **`trackedSymbols` GROWS at runtime** (`:942-944` `updateCache`, `:1000` `seedLastKnownGoodPrice`) — **it is not fixed at the five hardcoded seeds, and my entry-point census did not record that.** ⇒ **observing `REST_BLOCKED` for exactly the five seeds and no others is itself a datum needing explanation.**

## G5. ⛔⛔ **E8's SUPPRESSION CHAIN IS WRONG, AND THE REAL CONSEQUENCE IS THE OPPOSITE AND WORSE**
**Traced with the `fetchPrice` write suppressed:**
- **Row present (the normal crypto case):** `:1112` `fetchPrice` → `:1113` `updated = priceCache.get(...)` — **the suppressed write leaves the OLD ROW in the map, so `updated` is truthy** and `:1115-1122` returns it carrying **the row's ORIGINAL tag**. ⇒ **if that tag is `kraken_ws`/`kraken_rest` it PASSES `isKrakenVenueSource` and is used as ACTIONABLE.** ⛔ **A stale price treated as venue-fresh — which is WORSE than a skip, and is the same laundering family this batch exists to fix.**
- **No row at all:** `updated` undefined → `:1134` returns **`null`** → the engine's gate fails on `priceResult !== null` → direct REST → on failure `_recordPriceSkip` + `continue`. ⇒ **a skip IS reachable — via a NULL RETURN, not via a `last_known_good` tag failing the venue gate.**
⇒ ⛔ **E8's stated chain (`:1134` → `last_known_good` → fails the gate → skip) does not hold. The `:1134` arm is effectively unreachable with a non-null `cached`** — it needs the `:1111` `try` to throw, and `fetchPrice` (`:456-497`) wraps its whole body and returns `void`.
⭐ **AND THE CONSEQUENCE FOR P1/P3 IS THE IMPORTANT PART: today's honest `last_known_good` tagging is delivered by the `:474` WRITE (via `fetchLivePrice:564-571`) and the `:1115` return — NOT by the `:1134` last-resort arm.** ⇒ **suppressing the write removes the very mechanism that produces the honest tag.** **P3's placement decision is now load-bearing for the honest path too, not only for re-serve.**
⚠️ **Citation correction: `:160-165` and `b-exit-provenance-fence.test.ts:210-213` are both COMMENT PROSE. I presented one as a test pin. The suite's actual assertions are `:214-216`, `:236`, `:259`.**

## G6. ⛔ **E5 OVERSTATED THE TEST'S GRIP.** `b-exit-provenance-fence.test.ts:259` is `expect(union).toContain("'kraken_rest_poller'")` — it pins the token's **PRESENCE**. ⇒ **adding a fifth producer alongside it leaves the assertion GREEN; only a removal or rename breaks it.** ✅ **"PINS THE TOKEN I INTEND TO CHANGE" is withdrawn** — the plan adds, it does not rename. **E5's `tsconfig` reach trap stands.**

## G7. ⛔ **A1.4's STALE-CITATION CENSUS FOUND 2 OF 4 — IN THE SECTION ABOUT STALE CITATIONS**
Two more in the same file: **`:162`** says the null arm suppresses at *"`:429` and `:1201`"* (**actual `:474` and `:1248`**), and **`:1243`** says *"the same rule as the writer at `:307`"* (**actual `:474`**). ⭐ **Meanwhile `:127` cites the identical pair CORRECTLY as `:473`/`:1248`** — so the file holds a correct and a stale citation for the same two sites.
✅ **A1.4's narrow claim ("the only such cast is at `:478`") is true; its CENSUS was incomplete.** ⇒ **the generalisable lesson survives and is strengthened: 4 stale absolute citations in one file, 0 stale relative ones.**

## G8. ✅ CONFIRMED BY ROUND 3, recorded and NOT cited as support
E1's counts and the five assignment sites (**complete — `peekCachedPrice`'s consumer is `string`-typed so adds no sixth break**) · the `:252` array and `:253-254` predicate · **E6 both halves** · E9's one-caller claim · the `tsconfig` test exclusion · `REST_BLOCKED` has **exactly one emitter** (`:629`), so Set 1's instrument is unambiguous.
⚠️ **Round 3 has NO staging or database access** ⇒ **it could confirm none of §A2/§D3's runtime or SQL numbers. Every such figure in this document remains single-sourced to me, and Langston is told so.**

## G9. ⇒ FINAL PLAN DELTA FROM ROUND 3
| # | change | from |
|---|---|---|
| **A1.1** | ✅ **REVERTED to the guard attribution.** The cast is *necessary* by union arithmetic and *sound* by the `:467` guard. | **G1** |
| **P8** | **Re-aimed: log consistency, not a behaviour gate. Broadened to BOTH substring matchers** (`isRestFallbackSource` **and** `routes.ts:12336`). | **G2** |
| **P6** | **Primary instrument becomes `GET /api/diagnostics/8.8.5/rate-limiter`** (cumulative counters + `perSymbolCooldowns`); the log grep demotes to cross-check. **Adds: why only the 5 seeds appear when `trackedSymbols` grows.** | **G3, G4** |
| **P3** | ⛔ **Escalated: a suppressed write does NOT fail closed — it re-serves the OLD row under its ORIGINAL venue tag and PASSES the actionability gate.** And it removes the mechanism that produces today's honest tag. | **G5** |
| **P7** | **Strengthened by evidence: 4 stale absolute citations in this one file, 0 stale relative ones.** | **G7** |


---

# H. ⛔⛔ STEP-2 VERDICT: **CHANGES-NEEDED. FOUR BLOCKERS, ALL RE-DERIVED, ALL CORRECT.**

**Langston at `38e0a539c` + staging. He independently re-derived both unions, the gate, the predicate, the guard/cast, the null arm, the blocked branch, the stamp, the honest leg, `getPriceWithFallback:1060-1145`, and — on staging — `exit_price_producer='kraken_rest_poller'` = 0 against a control of 26 over 665, open positions 2/both xStock/zero crypto, and 19 of 420 across 104 symbols.**
✅ **§D3 and §A2.2 therefore STAND RE-DERIVED, not reported.** *(His first denominator pass added `symbol LIKE '%/USD'` and got 295/68 — his predicate was narrower than the population; mine was right.)*

## H1. ⛔⛔ BLOCKER-1 — **P2 WOULD ROUTE THE RATE-LIMITED POPULATION *AROUND* THE RATE LIMITER. I NEVER NAMED THE DOWNSTREAM.**
**RE-DERIVED at the ref:**
- The engine gate is **`active-execution-engine.ts:1277`** — `if (priceResult !== null && priceResult.price !== null && isKrakenVenueSource(priceResult.source))`. ⛔ **My audit never cites it.**
- Its **else-arm at `:1289-1300`** calls `this.krakenService.getTicker(restPair)` → `kraken.ts:259` → `makePublicRequest` (`:177`) → **a bare `fetch`. No limiter.**
- **`restRateLimiter.check` has EXACTLY ONE production caller: `live-pricing-adapter.ts:627`.**
⇒ ⛔⛔ **TODAY the laundered `kraken_rest` tag PASSES the gate and thereby SUPPRESSES a direct call. AFTER P2 the honest literal FAILS it, and every such tick issues ONE UN-RATE-LIMITED KRAKEN PUBLIC REST CALL** — sending exactly the blocked population around the limiter **whose stated purpose (`:622`) is ban prevention.**
**Population, stated honestly:** `{open crypto position} × {WS quiet} × {block}`. **Crypto open positions are 0, so today's added volume is ≈0 and scales with positions.** ⛔ **Not a live-risk claim — an UNNAMED LIMB, which is worse in a plan than a named risk.**

### ⛔ AND MY P2 VERIFICATION CANNOT FAIL — **THE THIRD NON-DISCRIMINATING CHECK I HAVE WRITTEN IN TWO DAYS**
P2's criterion was *"the gate's own source list is byte-unchanged in the diff."* ⇒ **that PASSES IF P2 IS NEVER IMPLEMENTED.** ★ **Same shape as `threshold=0` and as the withdrawn OBJ-4 falsifier. A criterion satisfied by doing nothing is not a criterion.**
✅ **REPLACED:** P2 is verified by **the engine's own behaviour at `:1277`** — a post-change tick on a rate-limited re-serve must take the **else-arm**, evidenced by its `[P19-B8.5][VENUE_ONLY]` warn line naming the new literal, **with a control**: a genuine venue read in the same window that still takes the `if`-arm.

## H2. ⛔⛔ BLOCKER-2 — **P6 HAD NO DECISION RULE. WRITTEN NOW, BEFORE THE MEASUREMENT.**
The document made P6 a precondition of P2 and **never said what P6 must RETURN for P2 to proceed** ⇒ it would decay into measure-then-argue with the answer already in hand.

> ### ⛔ P6 PRE-REGISTERED DECISION RULE — written 2026-08-31, BEFORE any P6 measurement
> **P2 SHIPS ONLY IF the engine's direct-REST else-arm (`active-execution-engine.ts:1289-1300`) FIRST passes through `restRateLimiter`. Otherwise P2 is HELD — regardless of the measured rate.**
> ★ **This deliberately converts a magnitude question into a STRUCTURAL precondition, and the reason is that routing around a ban-prevention limiter is not a thing to trade off against a percentage.** ⛔ **I am NOT inventing a tolerable-calls-per-minute threshold; I would be picking it to clear.**
> **P6 still MEASURES and REPORTS, for the record and for `#971`:** (a) the **reach-rate** — blocked-branch entries/hour, via the `getStats()` endpoint, **two reads ≥1 h apart with no reset between**; (b) the **projected added un-limited call rate** = reach-rate × the fraction of the window with ≥1 open crypto position; (c) **Langston's column (2)** — concurrent WS-write gap per symbol during a burst.
> **FALSIFIER: if (a) cannot be obtained without a log grep, P6 is NOT discharged** — that dependency is what produced §F1's 27× error.

## H3. ⛔⛔ BLOCKER-3 — **MY SIX SOURCES MISSED A DOCUMENT I *OWN*, AND IT ALREADY DOCUMENTED THIS DEFECT IN FULL**
**`1-system-manual/ACTIVE_PATH_FLOW.md:316-317` — a file that is MY STANDING ASSIGNMENT** — already traces both hops, classifies hop 6 as *"NOT A PENDING DECISION — A DEFECT (`#951`, plan 3b.f)"*, names the engine gate at hop 7 **and states the skip consequence.**
⇒ ⛔ **§A5's *"the branch's sole provenance is the git commit"* IS FALSE — an asserted absence with presence-grade evidence sitting in a document I maintain.** ★ **I ran a six-source audit and did not read my own map.**
⇒ ✅ **`ACTIVE_PATH_FLOW.md` JOINS THIS BATCH'S TIER-1 SET.**

### ⛔ AND THE CITATION CLASS WAS FIXED ONE POINTER AT A TIME UNTIL A REVIEWER MADE ME GREP IT
APF carried **the same stale triple** §D4 "corrected" in `#951`, and its gate cite was `:1020`/`:1025` for `:1277`/`:1289`.
⛔⛔ **WORSE, AND IT IS MINE: THE GREP FOUND THREE MORE STALE CITATIONS *INSIDE `#951` ITSELF* THAT MY OWN D4 FIX DID NOT REACH** (`:1267`, `:1268`, `:1270`).
✅ **GREPPED THE CLASS AND FIXED EVERY INSTANCE — 18 replacements across 3 documents:** `ACTIVE_PATH_FLOW.md` **5** · `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md` **2** · `RUNNING_ISSUES.md` **11**. **Read back: zero remaining, excluding two of my own passages that quote the old numbers as history.**
★★ **THIS IS `fix-follows-pointer` LANDING ON THE BATCH THAT NAMED IT — TWICE.** **FIFTH drift instance in two days. The lesson is now measured rather than asserted: fixing where the reviewer points fixes ONE instance; only grepping the CLASS fixes the defect.**

## H4. ⛔⛔ BLOCKER-4 — **TWO PRODUCTION COMMENTS ASSERT THE CHAIN §G5 REFUTED, AND THEY ARE WHAT FED MY E8**
**`live-pricing-adapter.ts:127-129` and `:162-164`** both state a null-arm placement *"reaches `last_known_good`, fails the venue gate, and falls to direct REST — a SKIPPED POSITION."*
**RE-DERIVED FALSE:** the suppressed write leaves the old row; `:1113` finds it; **`:1115-1122` returns it under its ORIGINAL tag** — and **performs NO age re-check whatsoever.**
⇒ ⛔⛔ **THE RE-SERVE BYPASSES THE 2000 ms WINDOW AS WELL AS THE PREDICATE — worse than §G5 reached.**
⇒ ✅ **"the new producer must not map to `null`" is promoted from a plan note to a FENCED INVARIANT.**
⇒ ✅ **P7 IS WIDENED: it covers FALSE MECHANISM PROSE, not only line-number drift.** ★ **I read those two comments and propagated their claim into E8 — a comment's provenance is not its correctness.**

## H5. ✅ NON-BLOCKING, ALL ACCEPTED
- **P1's inertness is asserted, not measured.** `getAllPrices():418` ships `observedAt` to two out-of-module consumers and P9 checks them against the new **literal** only. ⇒ **P9 extended to the read sites, not just the literal.**
- **P3 persists a fifth producer into `closed_trades.exit_price_producer`** and its verification tested only the in-memory map ⇒ **state whether the column/schema side is constrained, or it is the `#704` shape again.**
- **The doc said `#970`; the renumber to `#971` is at `RUNNING_ISSUES:5999`.** ✅ Corrected.
- **G4's endpoint has a sibling RESET route (`routes.ts:10929-10931`)** — a reset mid-window voids a cumulative-delta read — **and it needs auth** (he got `No authentication credentials provided`). ⇒ **P6 names who can reach it and asserts no reset in-window.**

## H6. ✅ HIS ANSWERS TO MY THREE QUESTIONS
**(a)** The split is real **given today's read sites** — *"state it as that, not as a property"* ✅ — **and P2's behaviour change is a skip-or-direct-REST at `:1277`, which the plan never named.** ✅ now named.
**(b)** The escalation is correct and independently verified, **and worse in one respect round 3 did not reach: the re-serve bypasses the age window entirely.** ⇒ fenced invariant.
**(c)** `#971` correctly scoped out; the §13 form is right — **named batch, owner, placed by position, no date.** ✅ **And BLOCKER-1's un-limited direct-REST leg FOLDS INTO `#971`** — *"it is literally the same 'no direct Kraken calls' divergence, so it gets a home without manufacturing a batch."*

## H7. ⚠️ WHAT HE COULD **NOT** RE-DERIVE, AND HE REPORTED NO NUMBER RATHER THAN A ZERO
**He did not locate the app stdout stream this turn, and his own note says that path returns false zeros** ⇒ **he reported NO number for the 56/19 burst and the 3.5-minute span.** ⇒ **§F1/§F2 remain SINGLE-SOURCED TO ME** — consistent with P2 being gated anyway. ★ **Refusing to publish a zero from an unvalidated instrument is the same discipline this batch keeps having to relearn.**
**Board: Review = SENT BACK TO OWNER, read back, census 71 of 71.**


---

# PART B2 — ⛔ **THE PLAN, REBUILT UNDER THE FOUR BLOCKERS. THIS SUPERSEDES PART B.**

> **Part B is retained above as the record of what was sent back. Where the two differ, B2 governs.**

## B2.0 ⛔⛔ THE STRUCTURAL CONSEQUENCE OF BLOCKER-1: **THE BATCH SPLITS. THE PROVENANCE HALF SHIPS; THE BEHAVIOUR HALF IS CARVED OUT.**

BLOCKER-1 establishes that P2 — the honest `source` literal — **cannot ship until the engine's direct-REST else-arm (`active-execution-engine.ts:1289-1300`) is routed through `restRateLimiter`**, because relabelling makes the gate at `:1277` fail and sends the blocked population to a **bare `fetch` with no limiter** (`kraken.ts:177`).
**Langston homed that leg to `#971`/`B-TWO-CACHE-INTENT`** (§13 disposition 2) — *"literally the same 'no direct Kraken calls' divergence."* ⇒ **the fix for P2's precondition lives in another batch, whose own first deliverable is a three-outcome READ, not a fix.**

⇒ ⛔ **HOLDING THE WHOLE BATCH BEHIND THAT WOULD PARK A CORRECT, ZERO-BEHAVIOUR-CHANGE PROVENANCE FIX BEHIND AN UNSCHEDULED ARCHITECTURAL READ.** ★ **That is precisely the shape Langston refused for the pricing-feed work on 2026-08-30 — *"parking trading-value work behind a governance batch is the failure this batch is diagnosing."***

✅ **THEREFORE, PROPOSED (his call, not mine to take):**
| | ships in THIS batch | carved out |
|---|---|---|
| **P1** carry the true age · **P3** fifth producer token · **P5** re-serve monotonicity · **P7** comment truth · **P9** read-site check | ✅ **YES — provenance-only, no decision path changes** | |
| **P2** the honest `source` literal · **P8** the substring-matcher naming | | ⛔ **CARVED OUT to `B-PRICE-AGE-REFUSAL`, owner CC-C, placed at plan row 3b.f-b, immediately after 3b.f — GATED on `#971` landing the limiter leg** |
⚠️ **STATED PLAINLY: the carve-out means this batch makes the age RECOVERABLE and does NOT make the engine REFUSE a stale re-serve.** ⛔ **That is exactly the `#743` distinction — *recoverability is not a bound* — and I am accepting the same boundary here that I drew for F-C, applied to my own batch.**

## B2.1 THE REBUILT ITEMS

| # | plan item | falls out of | ⛔ verification — **each must be able to FAIL** |
|---|---|---|---|
| **P1** | `fetchFromKrakenRest`'s rate-limited branch returns the cache **row** (or `{price, observedAt}`), not a bare number; the caller propagates `observedAt` instead of stamping `Date.now()`. | A1, D1 | a rate-limited re-serve carries `observedAt !== Date.now()`, **against a control**: a genuine REST read in the same window whose `observedAt` IS ≈ now. ⚠️ **P1 is INERT on the decision path and must be described that way — no gate reads `observedAt` (§D1).** |
| **P3** | A fifth `producer` token. ⛔ **FENCED INVARIANT, not a note: it MUST NOT map to `null` in `toCachedProducer`.** | A1.3, G5, H4 | ✅ **A test that FAILS if the token is placed in the `null` arm.** ⛔ **And state the `closed_trades.exit_price_producer` column side** — the in-memory map is not the persistence contract (`#704` shape). |
| **P5** | Re-serve monotonicity: for a symbol, `observedAt` may advance only when a genuine venue read occurred. | §7.3 | a tick logging `REST_BLOCKED` on symbol S **must not** advance S's `observedAt`. |
| **P7** | ⛔ **WIDENED: comments carry no absolute line numbers AND no false mechanism prose.** | A1.4, G7, H4 | **`:127-129` and `:162-164` are rewritten** — both currently assert the refuted skip-chain. ⚠️ **And `:1115` performs NO age re-check, so the re-serve bypasses the 2000 ms window as well as the predicate; the corrected comment must say so.** |
| **P9** | ⛔ **EXTENDED beyond the literal: `getAllPrices()` (`:418`) ships `source`/`producer`/`observedAt` to `server/index.ts:1100` and `routes.ts:6105`.** Check both **read sites**, not only the new literal. | E3, H5 | each consumer named and its handling of a carried-through `observedAt` stated. |
| **P2** ⛔ **CARVED OUT** | The honest `source` literal, added to **BOTH** unions (`PriceQuote:195` **and** `CachedPrice:211`). | E1, H1 | ⛔ **NEW, and it can fail: a post-change tick on a rate-limited re-serve must take the `:1277` ELSE-arm, evidenced by its `[P19-B8.5][VENUE_ONLY]` warn naming the new literal — with a control: a genuine venue read in the same window still taking the `if`-arm.** ⛔ **The old criterion ("source list byte-unchanged") passed if P2 was never implemented.** |
| **P8** ⛔ **CARVED OUT with P2** | The literal's name chosen against **both** substring matchers — `isRestFallbackSource` (`:252-254`) **and** `routes.ts:12336`. | E2, G2 | intended verdict of each matcher **stated and asserted in a test**. ⚠️ **Log consistency, NOT a behaviour gate (§G2).** |

## B2.2 ⛔ P6 — THE PRE-REGISTERED DECISION RULE **(written before any measurement; this is the BLOCKER-2 fix)**

> **P2 SHIPS ONLY IF the engine's direct-REST else-arm (`active-execution-engine.ts:1289-1300`) FIRST passes through `restRateLimiter`. Otherwise P2 is HELD — regardless of the measured rate.**
> ★ **A STRUCTURAL precondition, deliberately, not a magnitude one: routing around a ban-prevention limiter is not a thing to trade off against a percentage, and any threshold I invented I would have picked to clear.**

**P6 still MEASURES and REPORTS, for the record and for `#971`:**
1. **Reach-rate** — blocked-branch entries/hour, via `GET /api/diagnostics/8.8.5/rate-limiter` (`routes.ts:10907-10924`), **two reads ≥1 h apart**. ⛔ **Assert no reset in-window** — the sibling reset route (`:10929-10931`) voids a cumulative-delta read — **and name who can reach it; it requires auth.**
2. **Projected added un-limited call rate** = reach-rate × fraction of window with ≥1 open crypto position.
3. **Langston's column (2)** — concurrent WS-write gap per symbol during a burst.
⛔ **FALSIFIER: if (1) cannot be obtained WITHOUT a log grep, P6 is NOT discharged.** ★ **That dependency is exactly what produced §F1's 27× error.**

## B2.3 ✅ TIER-1 SET, CORRECTED
**`ACTIVE_PATH_FLOW.md` JOINS IT** (BLOCKER-3) — it already documents this defect at `:316-317` and **must be updated when the batch lands**, not merely cited. ⛔ **My §A5 "sole provenance is the git commit" is withdrawn as false.**

## B2.4 ⇒ WHAT THE BATCH NO LONGER CLAIMS
- ⛔ **It does not make the engine refuse a stale re-serve.** That is P2, carved out.
- ⛔ **It states no daily rate.** (§F1.)
- ⛔ **It does not assert that `observedAt` reaches a gate.** It does not (§D1).
- ✅ **It DOES make the age recoverable, the provenance honest, and P1/F-C buildable** — which was the batch's actual purpose.


---

# PART B2.5 — ⛔⛔ **THE OBJECTIVE LEDGER. NOTHING FROM THE SCOPE IS ALLOWED TO BE "NO LONGER GATING" AND QUIETLY DROPPED.**

> **KYLE, 2026-08-31, and it is a sharper point than the condition that prompted it:** *"These items that have been dropped are no longer gating and just kind of ignoring them. Let's not do that… if there's an outstanding issue that was a part of the original scope, then let's be proactive about it and make sure it gets included."*
> ⛔ **He is right, and the audit of my own rebuild is worse than the one item Langston named.** **Measured: of `OBJ-1`…`OBJ-5`, ZERO appear anywhere in Part B2** — the rebuilt plan carried plan-items and **silently stopped tracing the objectives they exist to discharge.** `P4` was gone outright. **A plan that renumbers its items and drops its objectives reads as complete while covering less.**

## B2.5.1 EVERY OBJECTIVE, ITS ITEM, AND ITS DISPOSITION — **no row may be blank**

| objective (from the scope) | plan item | disposition |
|---|---|---|
| **OBJ-1** — the rate-limited branch stops discarding age | **P1** | ✅ **SHIPS HERE** |
| **OBJ-2** — the labels tell the truth, actionability measured first | **P2 + P8** | ⛔ **CARVED OUT** → `B-PRICE-AGE-REFUSAL`, row 3b.f-b, gated on `#971` |
| **OBJ-3** — census of price-**SUBSTITUTION** sites, not quote-construction sites | ⭐ **P10 (NEW — it had no plan item at all)** | ✅ **DISCHARGED IN THIS DOCUMENT — see B2.5.2** |
| **OBJ-4** — the persisted poison | **P5** | ✅ **SHIPS HERE** *(falsifier replaced — §7.3)* |
| **OBJ-5** — `#743`/F-C not folded in, boundary written | scope §5 | ✅ **DISCHARGED** — boundary written and Langston-confirmed |
| — | **P4** ⛔ **WAS DROPPED FROM B2 ENTIRELY** | ✅ **RESTORED — CARVED OUT with P2** *(it is the union/cast item FOR P2's literal; it has no meaning without P2)* |
| — | **P6** | ⚠️ **EXPLICITLY NON-GATING HERE — MOVES WITH P2.** See B2.5.3 |
| — | **P7, P9** | ✅ **SHIP HERE** |

## B2.5.2 ⭐ **OBJ-3 — DISCHARGED NOW, WITH A NEGATIVE RESULT STATED**
**The shape to find: a function that SUBSTITUTES a cached value and returns it as a BARE primitive, losing provenance one call-frame below the site that constructs the quote.** *(That shape is why `B-EXIT-PROVENANCE`'s census of four quote-constructors could not see the fifth leg — scope §2.)*

**Census, `server/services/live-pricing-adapter.ts` + `price-cache.ts` + `server/exchanges/kraken/kraken.ts`:**
| site | returns | verdict |
|---|---|---|
| **`live-pricing-adapter.ts:624` `fetchFromKrakenRest`** | `Promise<number \| null>`, `return cached?.price ?? null` (`:631`) | ⛔ **THE INSTANCE — this batch's subject** |
| **`kraken.ts:624` `getPairHistoryDays`** | `Promise<number \| null>`, `return cached.days` on a 24 h-TTL hit | ✅ **SAME SHAPE, NOT A DEFECT — the quantity is HISTORY-DAYS, not a price.** A day-count re-served up to 24 h stale is immaterial to the pass/fail its caller makes, and it carries a real TTL rather than none. **Recorded so the next census does not re-open it.** |
| sites returning `cached?.price` as a bare value | — | **EXACTLY ONE: `:631`** |

⇒ ✅ **OBJ-3's ANSWER: the price-substitution shape occurs at EXACTLY ONE site, and this batch fixes it.**
⚠️ **REACH, STATED: the search was `Promise<number | null>` + `cached?.price`-style returns across three pricing files.** A substitution returning a differently-typed primitive, or living outside those three files, would not have been found. **The negative result is bounded by that, and I am not claiming a repo-wide absence.**

## B2.5.3 ⚠️ **P6 — WHY "NON-GATING" IS WRITTEN DOWN RATHER THAN LEFT IMPLICIT**
Langston: *"P6 gates nothing here now — move it with P2 or label it explicitly non-gating, so its own falsifier can't block closure of a batch it no longer governs."*
✅ **BOTH, deliberately: P6 MOVES WITH P2 to `B-PRICE-AGE-REFUSAL` (it is that batch's precondition), AND it is labelled NON-GATING for `B-PRICE-AGE-TRUTH`.**
⛔ **It is NOT dropped, and the distinction is the whole of Kyle's point: a non-gating item still has an owner, a home and a criterion — it simply does not block THIS close.** ⇒ **P6's pre-registered decision rule (B2.2) travels with it, unchanged and still written before any measurement.**

## B2.5.4 ✅ LANGSTON'S FOUR CONDITIONS — EACH WITH ITS ITEM
| # | condition | where it lands |
|---|---|---|
| **1** | **Prove the split held** — P1 needs the MIRROR of P2's criterion: post-change, a rate-limited re-serve must still take the `:1277` **IF**-arm, because P1 propagates `observedAt` only and `source` stays `kraken_rest`. | ✅ **P1's verification, rewritten below.** ★ *"That check is what makes 'zero behaviour change' falsifiable instead of asserted."* |
| **2** | **P3's fence is load-bearing, not hygiene** — a misplaced token **IS** P2, with the unlimited-fetch consequence and no honest label. Mutation-prove the test; state the column side. | ✅ **P3, escalated.** |
| **3** | **The gate on `#971` must not become a park** — if `#971`'s read lands no limiter leg, `B-PRICE-AGE-REFUSAL` **absorbs the limiter routing as its own first item.** | ✅ **Written into plan row 3b.f-b now, not later.** |
| **4** | **P4 is unaccounted for** — carve it explicitly or it reads as dropped. | ✅ **B2.5.1 restores it, carved with P2.** |

**P1's VERIFICATION, REWRITTEN (condition 1):** post-change, a tick on a rate-limited re-serve **must still take the `:1277` IF-arm** — `source` remains `kraken_rest`, only `observedAt` changes. **CONTROL: the same tick's `observedAt` must differ from `Date.now()`.** ⇒ **the pair together is what makes "no behaviour change" falsifiable: if the ELSE-arm is taken, P1 has silently shipped P2.**

## B2.5.5 ✅ THE TWO NOTES
- **`ACTIVE_PATH_FLOW.md:316-317` is marked "HALF-FIXED, pointer to 3b.f-b" — NOT "fixed."** *(His wording, adopted verbatim.)*
- **B2.4 goes VERBATIM into the completion report and the catalog row**, so the batch's own limits travel with its name.
