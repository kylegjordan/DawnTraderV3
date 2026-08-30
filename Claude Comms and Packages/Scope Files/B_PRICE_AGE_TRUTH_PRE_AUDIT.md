# B-PRICE-AGE-TRUTH — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2)

**Batch:** `B-PRICE-AGE-TRUTH` (`#951`) · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class**: architecture
**Scope approved** by Langston at `ed2413924` with **7 conditions**, all applied in scope §7. **This document is written under them.**
**Audit performed** 2026-08-30/31 · **all code citations re-derived at `origin/migration/aws-supabase`.**

---

# 0. ⛔ PREVIOUSLY STATED vs NOW — EVERY NUMBER THAT MOVED SINCE THE SCOPE

> **PREVIOUSLY STATED: this batch gates THREE downstream batches. NOW: TWO (`P1`, `F-C`). REASON:** Langston's same-day plan ruling records `F-G-2` as **DECOUPLED with a design carve-out**, not gated (scope §7.4).
> **PREVIOUSLY STATED: `isKrakenVenueSource` at `:151`. NOW: `:224`. REASON:** `:151` is `toCachedProducer`, a different function. **The `SYSTEM_IMPACT_MAP` carried the same wrong number and is corrected in the same commit.**
> **PREVIOUSLY STATED: ~843 laundering events/day. NOW: ~843 is the OUTERMOST of three nested sets and overstates the trading delta. REASON:** the counter fires above the `cached == null` check (condition 1). **The innermost set is measured in §2.3 and is far smaller.**
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
⇒ ⛔ **BINDING ON THE PLAN: a new `source` literal MUST be added to `CachedPrice['source']` (`:210`), or the cast admits it silently and the cache holds a value the type says is impossible.**

**A1.2 — `CachedPrice` IS FILE-LOCAL, WHICH BOUNDS THE TYPE CHANGE.**
Two interfaces share the name: `live-pricing-adapter.ts:207 interface CachedPrice` (**no `export`**) and `price-cache.ts:41 export interface CachedPrice`. **They are different types in different modules.** ⇒ **extending the adapter's union is structurally a one-file change** and cannot reach `vts-runner`/`signal-orchestrator`, which import the *other* one.
**Current union (`:210`), six literals:** `'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good'`.
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
**Window: PM2 log, `2026-08-30 18:22:26 → 19:58:05` = 95.7 min, 36,728 lines.**

| set | measurement | instrument |
|---|---|---|
| **1 — branch taken** | **56** across **5 symbols** (`ETH/USD` 12 · `XRP/USD` 11 · `SOL/USD` 11 · `BTC/USD` 11 · `ADA/USD` 11) ⇒ 0.59/min | `[8.8.5][REST_BLOCKED]` |
| **2 — laundered quote produced** | ⭐ **56 of 56.** `price=none` occurrences: **0** | the log line prints `cached?.price ?? 'none'`, so it **records the `cached == null` case directly** |
| **3 — consumed at an exit decision** | ⭐ **BOUNDED ABOVE and small — see A2.2** | position + close overlap |

✅ **Positive control:** `REST_FALLBACK` (the *allowed* leg) = **19** in the same window ⇒ the instrument distinguishes the two legs rather than matching everything.
⚠️ **Set 1 = Set 2 in this window, but the nesting is structurally real** — `incrementRestFallbackBlocked()` fires at `:630` above the `cached` read, so a cold-start/post-restart window would separate them. **Langston's correction stands as a structural point even though this window shows no divergence.**
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
- **`fetchFromKrakenRest`: `private`, EXACTLY ONE call site (`:540`), 0 test references.**
- **`incrementRestFallbackBlocked`: EXACTLY ONE writer (`:630`)** ⇒ the counter is cleanly attributable.

⛔ **§9.5(a-ii) deletion-time state-write census: N/A — THIS BATCH DELETES NOTHING.** Stated rather than skipped.

---

# PART B — THE IMPLEMENTATION PLAN
**Every item back-references the audit finding it falls out of. Nothing here is `UNAUDITED`.**

| # | plan item | falls out of | verification |
|---|---|---|---|
| **P1** | **Carry the age.** `fetchFromKrakenRest`'s rate-limited branch returns the cache **row** (or `{price, observedAt}`), not a bare number; the caller propagates `observedAt` instead of stamping `Date.now()`. | **A1** | a rate-limited re-serve carries `observedAt !== Date.now()`, **against a control**: a genuine REST read in the same window whose `observedAt` IS ≈ now |
| **P2** | **Tell the truth in `source`** — a **new literal**, added to `CachedPrice['source']` (`:210`). Non-actionability is inherited because `isKrakenVenueSource` (`:224`) does not list it. ⛔ **The gate is NOT touched.** | **A1.1, A3** | the gate's own source list is byte-unchanged in the diff |
| **P3** | **A new fifth `producer` token, with its `toCachedProducer` placement STATED.** ⛔ **It must NOT map to `null`** — that suppresses the cache write and breaks re-serve. | **A1.3** | a re-served row still appears in the cache after the change; **the falsifier is the absence of that row** |
| **P4** | **Extend the union properly, do not ride the cast.** The `as` at `:478` would admit the new literal silently. | **A1.1** | removing the new literal from `CachedPrice['source']` **must produce a compile error** — if it does not, P4 failed |
| **P5** | **OBJ-4 replacement — re-serve monotonicity.** For a symbol, `observedAt` may advance only when a genuine venue read occurred. | **§7.3 (condition 3)** | a tick logging `REST_BLOCKED` on symbol S **must not** advance S's `observedAt` |
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
