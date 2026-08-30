# B-EXIT-BOOK-AGE-STAMP — SCOPE (Step 1)

**Batch:** `B-EXIT-BOOK-AGE-STAMP` · **change-class:** non_architecture · **Owner:** CC-C · **Phase:** 19
**Created:** 2026-08-30 · **Plan:** `1-system-manual/XSTOCK_PRICING_PLAN.md` **Phase A**

> ⭐ **THIS IS THE ONE STEP THAT CANNOT BE WRONG UNDER ANY LATER DECISION.** It records two facts and changes no behaviour. **Langston's ruling, 2026-08-30: split each step at the intent seam — instrumentation is intent-independent and ships now; behaviour changes wait for the decided-intent index.**
> ⚠️ **Kyle, same day: *"we're accumulating more and collecting more data that isn't right, and we're not working on collecting the right data."*** ✅ **This batch is that sentence answered.**

---

## 1. WHY — TWO THINGS WE CANNOT CURRENTLY MEASURE, AND ONE FINDING THAT RESTS ON A RECONSTRUCTION

⛔ **`#961` — the largest defect on the plan — is currently RECONSTRUCTED, not read.** The exit fill walks an order book and **never records how old it was.** `bookAgeMs` and `bookMid` are **NULL BY CONSTRUCTION on xStock** (`active-execution-engine.ts:1381-1392` — `_posClass === 'xstock_spot' ? null : getBookForFill(...)`). **Measured: crypto 15/78 populated, xStock 0/26.**
⇒ **So `#961`'s headline — 22 of 243 closes filled on a book older than the entry gate's own 15 s limit, worst 1,554.9 s — was rebuilt by joining the ticker archive after the fact.** ⛔ **A finding that large should not rest on a reconstruction.**

⛔ **`#962`/`W12` — the mark is `(bid+ask)/2` when both sides exist, else `last`, and it is UNTAGGED.** Measured 0 fallbacks in 373,450 rows — ⛔ **an xSTOCK TICKER-SNAP population; the CRYPTO arm is UNMEASURED and this zero may not be cited as covering it (r3, restated r7).** **And that zero is only readable because bid/ask presence can still be reconstructed today.** ⇒ **If the fallback ever fires we have no way to SEE it.** *(Langston's disposition: fold the tag in here.)*

⛔ **`W7` cannot be costed at all without this** — whether a given exit read a republished mark or a fresh tick **leaves no trace**, because the cache is never persisted.

---

## 2. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** *(r3)* | **On every TAKER close — INCLUDING `forceClosePosition`, which IS one (r3 BLOCKER-B) — record the age of the book the FILL walked, into a NEW column `exit_fill_depth_age_ms`.** ⭐ **RENAMED at Step 3 on Langston's condition 1 (was `exit_fill_book_age_ms`): its source is `getDepthSnapshot`, whose `ageMs` on xStock is a TICKER-SNAP ROW AGE, so `book_age` would assert a book on a class that has none.** ⛔ **NOT into `exit_book_age_ms`, which holds DECISION-time age (BLOCKER-1).** | ⛔ **BOTH cohorts asserted, and the coverage query CARRIES `B-EXIT-PROVENANCE`'s CARVE-OUT (r3 MATERIAL-C): it EXCLUDES `close_reason='never_filled'` and the three paths that never call `closePosition`, because `exit_fee_mode` is THREE-valued (107 live nulls) and a binary partition false-reds on all of them.** ⛔ **AND CRYPTO IS VERIFIED BY A PAIRED LOG LINE AT THE FILL SITE, NOT BY RECONSTRUCTION (r3 MATERIAL-D) — nothing persists the crypto WS mini-book, and the nearby ticker archive is a DIFFERENT FEED off a SEPARATE SOCKET.** |
| **OBJ-2** *(r7 — REDESIGNED ON LANGSTON'S RULING; supersedes r3/r5)* | ⭐ **NO NEW COLUMN. SPLIT THE COARSE MEMBERS OF THE EXISTING CLOSED `PriceProducer` UNION** so `exit_price_producer` alone determines the kind. **THREE members split** — `kraken_ws_ticker`, `kraken_equities_ws`, `kraken_rest_engine_fallback` — each into `_mid`/`_last`, decided where the predicate runs. ⛔ **`kraken_rest_poller` DOES NOT SPLIT (condition 2): its rate-limited branch `live-pricing-adapter.ts:583-587` returns `cached?.price` bare, so it has THREE arms and a two-way tag would stamp a laundered value — `#951`/`#546`. Leave coarse, say why in the union comment, `#951` splits it.** ⛔ **PURE RE-DESCRIPTION (condition 1): split only — never merge, never delete a member, never change which number is produced.** ⛔ **STRICT SUFFIX (condition 3), and `kraken_ws_ticker` is already a PREFIX of `kraken_ws_ticker_v1` ⇒ cohort queries ENUMERATE, never `LIKE`.** ⛔ **The union comment must state that `_mid` records the KIND and answers NOTHING about WHICH BBO — `#952`'s axis is untouched and both crypto legs come out `_mid`.** | **A post-deploy close carries a split member; a forced one-sided book yields `_last`.** ⭐ **AND THE SPLIT EPOCH — deploy sha + UTC — IS RECORDED IN THE SIM, because `F-G-2` 3c partitions closed trades by exit provenance and would otherwise silently read one cohort as two.** |
| **OBJ-3** *(r2; condition 4 added r7)* | ⛔ **NO BEHAVIOUR CHANGE — and the change-class stays `non_architecture` ONLY IF THIS HOLDS LITERALLY: no new emission site, no gate reading `producer`, no behaviour change. If any moves, RE-DECLARE `architecture` and the ledger entry leads with it.** | ✅ **A DIFF PROPERTY, NOT A REPLAY** (a replay cannot cover the maker leg, which is where BLOCKER-2 lives): **no changed line feeds a price, a gate, a comparator or an `await` that did not already exist.** `_closeSnap` is already computed and already awaited on the taker branch — a CHECKED FACT. |
| **OBJ-4** | **The reconstruction that `#961` rests on is retired for post-deploy rows** — the number is READ, not rebuilt. | `#961` updated to cite read values once n permits. |

---

## 3. ⛔ WHAT THIS BATCH DELIBERATELY DOES NOT DO

1. ⛔ **It does not gate on the age it records.** *(That is Phase B, and it is a RISK CALL for Kyle — `order-placer.ts:110-115` carries the deliberate opposite rule, "a close MUST still exit (never a stuck position)".)*
2. ⛔ **It does not change which price anything reads.**
3. ⛔ **It does not touch the maker leg's comparator** *(Phase B/`#962`)* — and note `:1499-1506` carries a **Langston-approved `D1` marker** that must not be collapsed into entry-parity.
4. ⛔ **It does not subscribe to the book channel** *(a separate, costed decision — 930-958 MB/day already, no order-book table exists).*

---

## 4. ⚠️ THE ONE REAL RISK, NAMED

**The xStock close ALREADY fetches a depth snapshot** (`:1997`) — **so the age exists in memory and is discarded.** ⇒ **OBJ-1 on xStock is a write, not a fetch: no new query, no new load.**
⚠️ **BUT the crypto path takes its book from `getBookForFill`, and `:1381-1392` sets the columns null for xStock DELIBERATELY, with a comment calling it *"the honest value and not a missed read"* because *"that class has no order book."*** ⛔ **THAT COMMENT IS NOW WRONG IN A LOAD-BEARING WAY — the class DOES consult a book at fill time, and its age is exactly the number we need.** ✅ **Correcting it is in scope; changing what it selects is not** — Langston approved that split explicitly. ⚠️ **r2 WIDENS IT: the same false claim has THREE copies — `:1389-1391`, the type at `:1923-1925`, and `depth-source.ts:96-99`. All three in one pass, or the next grep finds the stale two.**

---

## 5. PROVENANCE READ (MANDATORY 1.b)

| object | intent | disposition |
|---|---|---|
| `exit_book_age_ms` / `exit_book_mid` | added by `B-EXIT-PROVENANCE` so a trade proves its own prices | **(2) relevant, needs updating to today's intent** — the xStock null was correct when written and is not now |
| `getDepthSnapshot` | one interface, two class-keyed implementations | **(1) still relevant and correct** — untouched |
| `assessWarmth` | the entry's staleness gate | **(1) correct** — **NOT called here; Phase B owns that question** |
| the `_eqTick` mark | `P19-B8.5`, the venue mark for a class with no REST | **(2)** — the KIND tag is the update |

⚠️ **AND THE CORPUS LIMIT, STATED: `#956` established that decided intent also lives in CODE COMMENTS, which a scope/report search structurally cannot reach.** ⇒ **The `D1` marker was found that way. Before any Phase-B change, the in-code markers get read.**

---

# ⛔ r2 — SENT BACK BY LANGSTON, FOUR ITEMS. ALL ADOPTED.

## ⛔⛔ BLOCKER-1 — **TWO BOOK READS, TWO INSTANTS, ONE COLUMN. RESOLVED: A NEW COLUMN.**

**Re-derived at the ref.** `exitBookAgeMs` persists at `:2278` from `_exitProvenanceBase.bookAgeMs`, built at `:1392` from `_bookX` — **`getBookForFill` at the DECISION site `:1382`, inside the exit-monitor loop.** The **fill's** book is `_closeSnap`, a **separate, later `getDepthSnapshot` at `:1997`.**
⇒ ⛔ **The existing 15 crypto rows hold DECISION-time age. OBJ-1 as written would have put FILL-time age in the same column with no discriminator.**

★★ **AND THE COMMENT FOUR LINES BELOW ALREADY WARNS ABOUT THIS CLASS, VERBATIM:** *"Filling these from `_bookX` would store one feed under the other feed's name — **the precise wrong-object substitution this whole batch exists to make impossible, committed inside the instrument built to catch it**."*
⇒ ★ **Different FEEDS there; different INSTANTS here. Same class. I was one step from committing the mirror image of the thing that comment exists to prevent.**

✅ **DECISION, MADE IN SCOPE AND NOT AT IMPLEMENTATION TIME: A NEW COLUMN — `exit_fill_depth_age_ms` (renamed from `exit_fill_book_age_ms` at Step 3, Langston condition 1) — alongside the existing `exit_book_age_ms`. NOT one column plus a discriminator.**
**Why:** the existing column already holds 15 crypto rows of decision-time data, and **re-pointing its meaning would silently invalidate them**. A discriminator obliges **every** future reader to know to check it — and **the reader who does not will silently mix two objects**, which is this batch's entire subject. **A new column is additive, cannot corrupt what exists, and makes both objects nameable.** Cost: one nullable column.

## ⛔ BLOCKER-2 — **"ON EVERY CLOSE" IS FALSE ON TWO PATHS. BOTH NOW NAMED.**

**(a) THE MAKER LEG (`:1985-1994`) NEVER FETCHES A SNAPSHOT AT ALL** — `:2020-2024` says so outright.
⇒ ⛔ **A null there means *NO BOOK WAS WALKED*, which is a DIFFERENT null from *NOT RECORDED*.** ⛔ **And OBJ-1's original verification would have passed on a taker close while the maker cohort went untested — the exact cohort-blindness that comment was written to prevent.**
✅ **RESOLUTION, AND IT COSTS NOTHING: the two nulls are ALREADY discriminable by an existing column, `exit_fee_mode`.** null + `maker` = **no book was walked**. null + `taker` = **not recorded, and that is a bug.** ⇒ **No new field, and the verification must assert BOTH cohorts.**

**(b) `forceClosePosition:838-848` HARDCODES a null WITH A REASONED COMMENT and DOES reach `closePosition`.**
✅ **WE WRITE FROM THE TAKER BRANCH ONLY, WHERE `_closeSnap` EXISTS. `forceClosePosition`'s deliberate null is UNTOUCHED** — it is a flatten, not a book-walked fill, and its reasoning stands.

## ⛔ GAP-3 — **OBJ-2's LANDING SITE, AND THE VOCABULARY PROHIBITION ANSWERED HEAD-ON**

⛔ **`:813-816` prohibits widening the enumerated source/producer vocabulary — *"would re-open the exact door OBJ-5 exists to shut."***
✅ **SO THE MARK-KIND TAG DOES NOT RIDE THAT VOCABULARY. It gets its own nullable column, `exit_mark_kind`, holding `mid` or `last`.** **The prohibition is respected, not argued around.**
✅ **CHANGE-CLASS RE-CONFIRMED `non_architecture`, WITH THE MIGRATION IN THE DIFF: two nullable telemetry columns, no gate, no comparator, no vocabulary change.**

## ⛔ GAP-4 — **THE WRONG COMMENT HAS THREE COPIES. ALL THREE IN ONE PASS.**

`:1389-1391` · **the type at `:1923-1925`** · **`depth-source.ts:96-99`'s schema warning.**
⛔ **Correcting one is the stacked-correction failure — the next grep finds the stale two.** *(Langston named it against his own prior instance, which is why it carries.)*

## ✅ OBJ-3 RESTATED AS A **DIFF PROPERTY**, NOT A REPLAY

⛔ **A replay proves the exits on the cohort it covers, and CANNOT COVER THE MAKER LEG — which is where BLOCKER-2 lives.**
✅ **OBJ-3 (revised): NO CHANGED LINE FEEDS A PRICE, A GATE, A COMPARATOR OR AN `await` THAT DID NOT ALREADY EXIST.** **`_closeSnap` is already computed and already awaited on the taker branch — stated as a CHECKED FACT, not an assumption.**

---

# ⛔ r3 — SECOND READER, FIVE LOAD-BEARING ITEMS, TWO SHIP-STOPPING. ALL FIVE ADOPTED.

> ⭐ **The reader was briefed to report LOAD-BEARING ONLY and to say so if it found nothing. It returned five items, zero noise, and two of them would have shipped wrong code.** *(Kyle's standing instruction: readers on load-bearing pieces at every pivotal step, and no retraction reaches implementation.)*

## ⛔⛔ BLOCKER-A — **THE MARK RULE HAS TWO IMPLEMENTATIONS. THE SCOPE NAMED ONE, AND THE OTHER IS BEHIND A VARIABLE CALLED `lastPrice` THAT HOLDS A MID.**

**r2 stated the rule once, as universal, and §5 named only the xStock site. Re-derived — there are two:**
| class | site | code |
|---|---|---|
| xStock | `equity-spot-archiver.ts:135` | `_mark = (_bid>0 && _ask>0) ? (_bid+_ask)/2 : _last` |
| ⛔ **crypto** | **`kraken-v2-translator.ts:55-59`** | `let markPrice = last; if (bid>0 && ask>0) markPrice = (bid+ask)/2;` → **returned as `c[0]` at `:66`** |

⛔⛔ **AND THE CRYPTO VALUE REACHES THE EXIT DECISION THROUGH A VARIABLE WHOSE NAME IS ALREADY THE WRONG OBJECT:** `kraken-websocket-adapter.ts:681` — **`const lastPrice = parseFloat(safeData.c[0]);`** — **it says `lastPrice`; it holds a MID on every two-sided tick.**
⇒ ★★ **AN IMPLEMENTER WORKING FROM r2 INSTRUMENTS THE ONE SITE THE SCOPE NAMES, REACHES `:681` FOR CRYPTO, READS `lastPrice`, AND TAGS EVERY CRYPTO ROW `last` OVER A MIDPOINT — a column asserting the wrong object, committed inside the instrument built to catch wrong-object stamps.** *(And the alternative — leaving crypto NULL — puts a third undiscriminated value on a column whose OBJ-2 verification asserts non-null.)*

✅ **RESOLUTION: OBJ-2 NAMES BOTH SITES EXPLICITLY, AND THE KIND IS DERIVED AT THE SITE THAT COMPUTES IT — never inferred from a consumer's variable name.**
⚠️ **AND A MEASUREMENT LIMIT NOW STATED: `#962`'s *"0 fallbacks in 373,450 rows"* is an **xStock ticker-snap** population. **The crypto site's fallback rate is UNMEASURED**, so it does not extend to half the cohort OBJ-2 would newly instrument.** ⇒ **OBJ-2 may not cite that zero as covering crypto.**

## ⛔⛔ BLOCKER-B — **r2's PREMISE WAS FALSE: `forceClosePosition` *IS* A BOOK-WALKED TAKER FILL.**

**Re-derived:** `:837` calls `closePosition(...)` with an options object carrying **only `exitProvenance` — NO `makerExitFill`.** ⇒ it takes the **`else`** branch at `:1983` ⇒ **`:1997` fetches `_closeSnap` and `:1998-2003` walks it** ⇒ **`:2251` stamps `exitFeeMode: 'taker'`.**
⇒ ⛔ **r2 said *"write from the taker branch only"* AND *"force-close's null is untouched."* THOSE TWO INSTRUCTIONS CONTRADICT EACH OTHER.**
★ **And the reasoned null at `:838-848` does not cover this: its stated reason is *"this path runs OUTSIDE the evaluation loop, so no inter-tick cadence exists for it"* — true for the DECISION-time fields, and it does not transfer to a FILL-time book age, which does exist on this path.**

✅ **RESOLUTION: FORCE-CLOSE IS A TAKER CLOSE AND IT GETS A FILL BOOK AGE. Only the `:838-848` DECISION-time nulls stay untouched.**
⭐ **This is also the RIGHT answer on the merits: force-close is the one cohort the Phase-B gate explicitly EXEMPTS, so it is the cohort whose book age nobody could otherwise ever check.** ⛔ **Suppressing the write would have required a new conditional in the close path (violating OBJ-3) and would have manufactured a `null + taker` row — the state r2 defines as *"not recorded, and that is a bug"* — reporting a false bug on every force-close.**

## ⛔ MATERIAL-C — **`exit_fee_mode` IS THREE-VALUED, AND THE THIRD BUCKET IS STILL BEING PRODUCED.**

**r2's zero-cost discriminator assumed two values. Measured on live closes with `exit_fee_mode IS NULL`:**
| close_reason | rows |
|---|---|
| `never_filled` | **88** *(ongoing)* |
| `stop_hit` | **14** |
| `target_hit` | **5** |

**`exit_fee_mode` has exactly ONE writer — `:2251`, inside `closePosition`.** **Three other paths write a terminal `closed_at` and never touch it:** `:1077` (`never_filled`), `active-portfolio-manager.ts:651` (self-labelled *"THE FIFTH CLOSE PATH … never calls `closePosition`"*), and `active-engine-service.ts:352` (`engine_stop_cleanup`).
⇒ ⛔ **A coverage query built on a BINARY partition FALSE-REDS on all three; one built as `WHERE exit_fee_mode='taker'` SILENTLY DROPS them.**
✅ **RESOLUTION: CARRY `B-EXIT-PROVENANCE`'s EXISTING CARVE-OUT, which sits three lines from the write at `:1079-1086` and says it outright — *"the coverage check MUST exclude `close_reason='never_filled'`. Without that carve-out the coverage check reports a false failure, and the obvious 'fix' is to stamp a price that never existed."*** **The verification excludes `never_filled` AND the three non-`closePosition` paths, and names them.**

## ⛔ MATERIAL-D — **OBJ-1's VERIFICATION IS NOT EXECUTABLE ON CRYPTO.**

**xStock** reconstructs from `xstock_spot_ticker_snap` — the same table `depth-source.ts:47-70` reads. ✅
⛔ **CRYPTO CANNOT: `depth-source.ts:42-46` returns the in-memory WS mini-book, and NOTHING PERSISTS IT** *(control: zero book/depth tables in the schema against a live `crypto_spot_ticker_snap` hit).* **And the nearby `crypto_spot_ticker_snap` is a DIFFERENT FEED off a SEPARATE SOCKET at 5-9 s cadence — matching against it is not measuring the same object.**
⇒ ⛔ **So OBJ-1 as written passes on an xStock close and is SILENT ON CRYPTO — the population `#961`'s headline rests on.**
✅ **RESOLUTION: a paired log line at the fill site emits the same `ageMs` the column receives, so the column is verified against the process's own contemporaneous record rather than against a different feed.**

## ⛔ MATERIAL-E — **GAP-4's CENSUS WAS WRONG IN BOTH DIRECTIONS, AND MISSED THE COPY APPLIED TO THE LIVE DATABASE.**

| site | in GAP-4? | actually carries the claim? |
|---|---|---|
| `active-execution-engine.ts:1389` | ✅ | ✅ |
| `active-execution-engine.ts:1924` | ✅ | ✅ |
| ⛔ **`shared/schema.ts:1809`** | **NO** | ✅ *"…(no book for that class) — **The column comment IS the record of that distinction**"* |
| ⛔⛔ **`drizzle/migrations/2026-08-26-b-exit-provenance.sql:52` + `:55`** | **NO** | ✅ **`COMMENT ON COLUMN` — APPLIED TO THE LIVE DATABASE** |
| `depth-source.ts:96-99` | ✅ | ⛔ **NO — re-derived: ZERO occurrences in that file. I named a file that does not contain the claim.** |

⛔⛔ **`dt-deploy` runs `db:migrate` between build and restart, so those SQL comments are what an analyst reads from `\d+ closed_trades`.** ⇒ **Following r2 would have corrected two copies, edited a correct comment, and left the DATABASE ITSELF asserting *"xStock has no book"* directly beside a new `exit_fill_depth_age_ms` column populated on xStock — GAP-4's own named failure mode landing on GAP-4.**
✅ **RESOLUTION: FOUR sites — `:1389`, `:1924`, `shared/schema.ts:1809`, and the SQL comments — in one pass. `depth-source.ts` is REMOVED from the list.**
➕ **AND ONE MORE, SAME FIX: `exit_book_age_ms`'s DB comment reads *"Age of the order-book snapshot at close"* with NO INSTANT QUALIFIER.** ⛔ **Once a second at-close age column exists, that comment is precisely what makes the two mixable — the risk BLOCKER-1 chose a new column to avoid.** ⚠️ **And it is live already: 8 of 239 maker closes carry a non-null `exit_book_age_ms` (decision-time, from `getBookForFill`, which runs for crypto regardless of maker/taker) while their `exit_fill_depth_age_ms` will be NULL.**

## ✅ CHECKED AND CLEAN — recorded so it is not re-derived
- **OBJ-3's load-bearing claim HOLDS:** `_closeSnap` is genuinely already computed and already awaited at `:1997`; **no new `await`.** ⚠️ *Mechanical only: it is `const`-scoped to the `else` block `:1996-2013` while the persist is at `:2227`, so it must be hoisted.*
- **§4's "a write, not a fetch" HOLDS for xStock** — `getDepthSnapshot` already runs for the class.
- **BLOCKER-1's column split is correct, and no existing reader would mix them** — `exitBookAgeMs` has no client consumer; **the only mixing surface is the column comments, which is MATERIAL-E.**
- **Deploy ordering is safe** — `db:migrate` runs before restart, so the columns exist before the new code does.

---

# ⛔ r4 — LANGSTON'S BLOCKER-C AND CHANGES-NEEDED-D. BOTH RESOLVED.

## ✅ CHANGES-NEEDED-D — **ANSWERED WITH THE RANGE. THERE IS NO FOURTH WRITER.**

**His question: the 14 `stop_hit` + 5 `target_hit` rows with a null `exit_fee_mode` cannot come from the three paths I named — give the `closed_at` range and say which.**

| cohort | rows | earliest | latest |
|---|---|---|---|
| `stop_hit`, fee_mode null | 14 | **2026-07-15 06:18:24Z** | **2026-07-15 17:33:36Z** |
| `target_hit`, fee_mode null | 5 | **2026-07-15 06:30:42Z** | **2026-07-15 20:53:25Z** |
| ⭐ **earliest row that HAS a `fee_mode`** | — | **2026-07-15 21:43:55Z** | — |

⇒ ✅ **ALL 19 CLOSED BEFORE THE COLUMN'S FIRST WRITE, ON THE SAME DAY IT SHIPPED. THEY PREDATE THE STAMP.**
⇒ ✅ **THERE IS NO FOURTH TERMINAL-CLOSE WRITER — the alarming branch is ruled out, not assumed away.**
✅ **RESOLUTION: the carve-out takes a `closed_at` BOUND, not only close-reason filters.** **Coverage asserts on `closed_at >= 2026-07-15 21:43:55Z`, excludes `close_reason='never_filled'`, and excludes the three non-`closePosition` paths by name.**

## ⛔⛔ BLOCKER-C — **THE KIND IS COMPUTED AND DISCARDED ONE LINE LATER, ON BOTH SITES. THE CARRIER IS NOW NAMED.**

**Re-derived — neither structure has anywhere to put it:**
| site | structure | has a kind field? |
|---|---|---|
| xStock | `latestEquityTick = new Map<string, { price: number; tsMs: number }>()` (`:112`) | ⛔ **NO** |
| crypto | `V1TickerFormat { a; b; c; v? }` (`kraken-v2-translator.ts:31-36`) | ⛔ **NO** |

★ **And his framing is the right one: this is BLOCKER-A one hop downstream. An implementer with no sanctioned route improvises one, and the nearest thing to hand is the consumer's variable name — which is `lastPrice`, holding a mid.**

### ✅ THE CARRIER — **ONE EXPORTED PREDICATE, TWO DIFFERENT CARRIAGE ROUTES, AND NO SECOND COPY OF THE RULE**

⛔ **THE RULE ITSELF MUST EXIST ONCE.** Both sites already implement the same predicate independently — *"a mid iff both sides are positive, else `last`"* — which is the `#641` two-copies shape already in the tree.
✅ **`export function markKindOf(bid, ask): 'mid' | 'last'` — defined ONCE, in the translator, and CALLED by both producers.** **Neither site re-states the rule; the existing duplicated conditionals become calls.**

**HOP-BY-HOP:**
| # | hop | change |
|---|---|---|
| **xStock 1** | `equity-spot-archiver.ts:112` | `latestEquityTick` value type gains **`kind: 'mid' \| 'last'`** |
| **xStock 2** | `:136-138` | `.set(...)` carries `kind: markKindOf(_bid, _ask)` — ⛔ **a LITERAL FIELD-ADD. `parseTickerSnap`'s logic is UNCHANGED, per `#594`'s restated constraint that this map is the ONLY venue price source for the class.** |
| **xStock 3** | `active-execution-engine.ts:1163` | the **single** engine consumer *(census: 1 engine call site)* reads `_eqTick.kind` into a local, **the same way it already reads `_eqTick.tsMs`** |
| ⭐ **crypto 1** | `kraken-websocket-adapter.ts:681-683` | ⛔ **NO STRUCTURAL CHANGE. `V1TickerFormat` is NOT widened.** The adapter **already parses `a[0]` and `b[0]` two lines below `c[0]`** — so the kind is **RE-DERIVED there by calling the SAME exported `markKindOf`.** |
| **both** | → `exitProvenance` → `exit_mark_kind` | rides the existing provenance payload, **like every other stamp this batch's parent added** |

⭐⭐ **WHY CRYPTO RE-DERIVES RATHER THAN CARRIES: `V1TickerFormat` is a shared translator contract on a live trading path, and widening it is a bigger blast radius than this batch has any business taking.** ✅ **Re-deriving is safe ONLY because the predicate is a pure function of two values the consumer already has in hand — and it cannot drift, because both ends call the same exported function.** ⛔ **This is NOT "inferring from the variable name" — the name is ignored entirely; the values are re-read.**

### ✅ §5 DISPOSITIONS FOR THE STRUCTURES THE TAG TOUCHES *(the omission he named)*
| object | intent | disposition |
|---|---|---|
| `latestEquityTick` | `P19-B8.5` — the venue mark for a class with no REST; **`#594`: the ONLY venue price source for xStock** | **(2) relevant, needs updating** — a field-add, no logic change |
| `getLatestEquityTick` | the single accessor | **(1) correct** — signature widens with the value type; **one engine consumer** |
| `translateV2ToV1` / `V1TickerFormat` | `8.9.1`/`8.9.4-Patch` — carries the mark to the UI/engine in the v1 shape | ⛔ **(1) CORRECT AND UNTOUCHED** — the contract is not widened |
| `kraken-websocket-adapter` ticker handler | parses the v1 payload for the engine | **(2)** — re-derives the kind from values it already parses |
| the price cache | `#743`/`#951` territory | ⛔ **(1) UNTOUCHED — the tag does not enter the cache.** *(It would be a fourth object on a slot two producers already share.)* |

---

# ⛔⛔ r5 — I RE-DERIVED r4's CARRIER AT THE REF BEFORE DISPATCHING IT, AND IT WAS WRONG IN THE LOAD-BEARING HALF.

> ⚠️ **r4's crypto route does not reach the site that needs it.** Re-deriving the kind at `kraken-websocket-adapter.ts:681-683` puts it in that function's local scope and **nowhere else** — the value that drives a crypto exit is read four hops later, out of the price cache. **r4 also asserted the price cache was UNTOUCHED. For crypto it is THE CARRIER.**
> ★ **What the re-derivation found instead is SMALLER, and it is the shape this system already chose once and had reviewed.**

## ⛔ CORRECTION 1 — **THE PREDICATE HAS THREE IMPLEMENTATIONS, NOT TWO. r3 FOUND A SECOND; THERE IS A THIRD.**

| # | site | code | in r3/r4? |
|---|---|---|---|
| 1 | `equity-spot-archiver.ts:135` | `_mark = (_bid>0 && _ask>0) ? (_bid+_ask)/2 : _last` | ✅ |
| 2 | `kraken-v2-translator.ts:55-59` | `markPrice = last; if (bid>0 && ask>0) markPrice = (bid+ask)/2` | ✅ |
| ⛔ **3** | **`active-execution-engine.ts:1301-1305`** | **`currentPrice = (ask > 0 && bid > 0) ? (ask + bid) / 2 : lastTrade`** — the crypto direct-REST fallback, written out inline **in the engine itself** | ⛔ **NO** |

⇒ ★ **The rule is stated three times in three files and no two of them share a line.** Any batch that adds a kind tag while leaving three separate copies of the rule that decides it has built the `#641` shape into the instrument.

## ⛔⛔ CORRECTION 2 — **THE EXIT DECISION HAS THREE PRICE-RESOLUTION BRANCHES, AND `producer` ALREADY SOLVED EXACTLY THIS PROBLEM ON EXACTLY THESE THREE.**

**Re-derived at `active-execution-engine.ts:1136-1148` — `priceProducer` is declared once and *"ASSIGNED ON ALL THREE RESOLUTION BRANCHES BELOW"*:**
| branch | line | how `producer` gets there **today** |
|---|---|---|
| xStock WS | `:1231-1239` | ⭐ **LITERAL** — *"there is no adapter quote object on this leg, so THE CODE AT THIS LINE IS THE PRODUCER"* |
| crypto WS | `:1271-1277` | ⭐ **CARRIED** — *"★ THE ONLY GENUINE CARRY OF THE THREE — a real quote object with a real provenance field"* |
| crypto REST | `:1306-1313` | ⭐ **LITERAL** — *"direct `krakenService.getTicker`, mid computed inline, so the line is the producer"* |

⇒ ⛔⛔ **THE MARK KIND IS THE SAME PROBLEM ONE AXIS OVER, AND THE CODE SAYS SO IN ITS OWN WORDS.** `:1909-1911`: *"`source` alone cannot discriminate a book midpoint from a ticker print — both stamp `kraken_ws`. That is #741."*
★ **`producer` answers WHICH HANDLER. It does NOT answer WHICH KIND OF NUMBER** — `kraken_ws_ticker` **sounds like a print and is a midpoint** (`kraken-v2-translator.ts:55-59`). **That is `#952`, and it is the gap `exit_mark_kind` closes.**

## ✅ THE CORRECTED CARRIER — **`updateCache` IS THE CHOKE POINT, AND IT ALREADY TAKES A REQUIRED, NO-DEFAULT `producer` FOR THIS EXACT REASON**

**MEASURED — `updateCache` has THREE live callers, and they ARE the three branches:**
| caller | line | kind derivable there? |
|---|---|---|
| the crypto WS priceTick handler | `live-pricing-adapter.ts:1201` | ✅ from `bid`/`ask` parsed at `kraken-websocket-adapter.ts:682-683` — **cited by an existing comment at `:1393-1396` as computed-then-discarded** |
| the xStock feed-through | `active-execution-engine.ts:1244` | ✅ once `latestEquityTick` carries it (the field-add r4 specified) |
| the crypto REST feed-through | `active-execution-engine.ts:1332` | ✅ `ask`/`bid` are **already in scope** at `:1301-1303` |

✅ **SO: `markKind` becomes a REQUIRED, NO-DEFAULT PARAMETER OF `updateCache`, BESIDE `producer`, AND EVERY CALL SITE STATES ITS OWN.** The rationale is already written at `:848-851`: *"REQUIRED, no default. A default here would silently mislabel a future caller as whichever producer happened to be most common — the conflation this batch exists to end."* **Identical argument, identical shape, one axis over.**

**HOP-BY-HOP, ALL THREE BRANCHES:**
| branch | hops |
|---|---|
| **xStock** | `equity-spot-archiver.ts:112` value type gains `kind` → `:137` sets it (**literal field-add; `parseTickerSnap`'s logic UNCHANGED per `#594`**) → `getLatestEquityTick` widens → engine `:1239` reads it → `updateCache` `:1244` |
| **crypto WS** | translator predicate → `PriceTickEvent` (`:93-105`) gains `markKind` **REQUIRED + CLOSED, per its own stated rule at `:98-102`: *"a fourth producer is a COMPILE ERROR rather than a silent absence"*** → adapter `:699` emits it → handler `:1201` → `updateCache` → `CachedPrice` (`:163-173`) → `getPriceWithFallback` returns it beside `producer` → engine `:1276` |
| **crypto REST** | ⭐ **LITERAL at `:1305`** — zero plumbing, `ask`/`bid` in scope |
| **all three** | → `exitProvenance` (`:1906-1929`, gains `markKind`) → `:2280` region → `exit_mark_kind` |

⛔ **AND THE `#743` CARRY-THROUGH DISCIPLINE APPLIES:** a last-known-good re-serve must carry the ORIGINAL `markKind` unrefreshed, exactly as `observedAt` is carried at `:479`, `:526`, `:559`, `:1032`, `:1048`, `:1074`, `:1097`. *(Those legs are unreachable from the exit decision — `isKrakenVenueSource` at `:1269` rejects `last_known_good` — but a field that is right only on the reachable path is a trap for the next reader.)*

## ✅ §5 DISPOSITIONS — **CORRECTED. r4 SAID THE PRICE CACHE WAS UNTOUCHED. FOR CRYPTO IT IS THE CARRIER.**
| object | intent | disposition |
|---|---|---|
| `latestEquityTick` / `getLatestEquityTick` | `P19-B8.5`; **`#594`: the ONLY venue price source for xStock** | **(2)** — field-add, no logic change |
| `translateV2ToV1` / `V1TickerFormat` | `8.9.1` — midpoint as mark because *"'Last' is often stale on low-volume pairs"* | **(1) CORRECT, CONTRACT UNWIDENED** — the predicate is exported, the return shape is not touched |
| `PriceTickEvent` | `B78.1`; `#741` added `producer` **required + closed** | **(2)** — one more required+closed field, same rule |
| ⛔ **`updateCache` / `CachedPrice` / `getPriceWithFallback`** | `P19-B8.9a`, `#743`, `#951` | ⛔ **(2) — RELEVANT AND MUST BE UPDATED. r4 SAID "UNTOUCHED" AND THAT WAS WRONG: this is the only route from the crypto feed to the exit decision.** |
| the crypto REST fallback branch | `8.9.2` | **(2)** — literal derivation at `:1305` |

## ⛔ CORRECTION 3 — **TWO MORE COMMENT SITES, AND ONE OF THEM IS *NOT* WRONG, WHICH CHANGES THE FIX**
- ➕ **`active-execution-engine.ts:1909-1911`** — *"a book midpoint from a **ticker print**"*. ⛔ **The ticker does not emit a print; it emits a midpoint.** This is the misconception the batch exists to end, sitting four lines from where `markKind` is added.
- ⚠️ **`shared/schema.ts:1807-1810` — NOT SIMPLY WRONG, AND r3 OVERSTATED IT.** *"NULL BY CONSTRUCTION on xStock (no book for that class)"* stays **TRUE of `exitBookMid`/`exitBookAgeMs`**, whose source (`getBookForFill`, `:1381-1383`) really is crypto-only. ⇒ **The fix is not a correction but a BOUND: it is true of those two columns and MISLEADING as a class-level claim, because the fill-time `getDepthSnapshot` DOES synthesise an xStock ladder.** **Say which columns it governs.**

## ✅ CORRECTION 4 — **THE FILL-AGE STAMP GOES BELOW BOTH LEGS, AND THE PRECEDENT IS TWENTY LINES AWAY**
r3 resolved BLOCKER-B as *"write from the taker branch only."* ⛔ **`_closeSnap` is `const`-scoped to the `else` block (`:1997`) and the persist is at `:2280` — it is not in scope there.**
✅ **The same function already solved this, for the same reason, at `:2015-2019`:** the witness is *"Placed HERE, below the if/else, deliberately: the MAKER leg never fetches a depth snapshot at all … a witness taken inside the taker branch would be silently absent on exactly the cohort that produced this batch's first OBJ-2 specimen."*
⇒ **`let _fillBookAgeMs: number | null = null` above the `if`, assigned in the taker branch, read at persist.** **The maker null is then structural and discriminable by `exit_fee_mode='maker'`** — not a suppressed write.

## ⚠️ KNOWN TOUCH, STATED NOW RATHER THAN DISCOVERED IN CI
**Making `markKind` required on `updateCache` surfaces two existing three-argument call sites** — `server/tests/unit/p19-b8-9-venue-only-source.test.ts:75` and `:95` — **which today omit the already-required `producer`.** They are in the change set, not a surprise.

---

# ⛔⛔ r6 — TWO FRESH READERS, RUN CLAIM-ONLY. **GAP-3'S PREMISE IS FALSE, AND THAT OPENS A SMALLER DESIGN THAN ANY REVISION SO FAR.**

> **REVIEWER r1:** `claim-only` · *"exactly one `exit_fee_mode` writer, three non-stamping terminal-close paths"* · **HIT** · re-derived **y**
> **REVIEWER r2:** `claim-only` · *"the mark predicate has two implementations; neither carrier tags the kind; the crypto consumer can re-derive it"* · **HIT** · re-derived **y**
> ⛔ **Neither reader was told the conclusion, and each was asked only *"what other states of the world are consistent with these objects?"* Every item below was re-derived by me at the ref before it moved anything.**

## ⛔⛔ WITHDRAWN — **GAP-3. I CITED A PROHIBITION THAT IS NOT THERE.**

r2 said: *"the mark-kind tag gets its own column rather than widening the enumerated vocabulary, which `:813-816` explicitly prohibits."* **Re-read at the ref: `live-pricing-adapter.ts:806-822` is the WebSocket BROADCAST PAYLOAD. It says nothing about vocabulary.**
⛔⛔ **AND THE UNION SAYS THE OPPOSITE OF WHAT I CLAIMED, IN ITS OWN TEXT (`:92-97`):** *"★ SAFE BY CONSTRUCTION: the engine's actionable gate is `isKrakenVenueSource(source)` (:151), which reads `source` and NEVER `producer`, **so widening this union cannot reject a price or skip a position. That is design (B)'s defining property, verified at the ref.**"*
⇒ ★ **`PriceProducer` IS DESIGNED TO BE WIDENED SAFELY. GAP-3 INVERTED ITS DEFINING PROPERTY, AND EVERY REVISION SINCE HAS BUILT ON THAT.**
⚠️ **Same misreading I withdrew as `#953` rule 1b four days ago — retracted in the ledger, then used as this scope's foundation. `fix-follows-pointer`, one hop up.**

## ⛔ THE PREDICATE HAS **FOUR** IMPLEMENTATIONS — r3 FOUND 2, r5 FOUND A 3rd, THE READER FOUND A 4th
| # | site | class |
|---|---|---|
| 1 | `equity-spot-archiver.ts:135` | xStock |
| 2 | `kraken-v2-translator.ts:57-58` | crypto |
| 3 | `active-execution-engine.ts:1305` | crypto |
| ⛔ **4** | **`live-pricing-adapter.ts:645`** — the Kraken spot REST poller inside `fetchLivePrice` | crypto |

⚠️ **AND THEY ARE NOT IDENTICAL, so "one rule, four copies" overstates it:** the xStock site guards its output (`:136` `Number.isFinite(_mark) && _mark > 0`); the translator emits unconditionally and relies on its consumer's guard. **Provenance says convergent, not copied** — `8.9.1` for the translator, `P19-B8.5` for the archiver. ⇒ **a shared predicate is still right, but as a DEDUPLICATION, not as a bug fix.**

## ⭐ AND A **FIFTH** PRODUCER WHOSE KIND IS **ALREADY FULLY DETERMINED**
**`kraken-websocket-adapter.ts:908-918` → `:943`** emits a mini-book BBO midpoint with **no last-trade arm at all** (`if (bestBid <= 0 || bestAsk <= 0) continue`), stamped **`producer: 'kraken_ws_book_mid'`**.
⇒ ⛔ **THE KIND IS NOT ABSENT FROM THE SYSTEM — IT IS RECORDED FOR ONE OF THE UNION'S MEMBERS AND COARSE FOR FOUR.** The four ambiguous ones are `kraken_ws_ticker`, `kraken_equities_ws`, `kraken_rest_engine_fallback`, `kraken_rest_poller`.

## ⛔⛔ THEREFORE — THE ONE GATE FOR LANGSTON. **TWO DESIGNS, AND GAP-3 WAS THE ONLY THING RULING (B) OUT.**

| | **(A) A NEW `exit_mark_kind` COLUMN** *(r2-r5's design)* | ⭐ **(B) SPLIT THE FOUR COARSE PRODUCERS IN THE EXISTING CLOSED UNION** |
|---|---|---|
| what changes | a column, `PriceTickEvent`, `updateCache`, `CachedPrice`, `getPriceWithFallback`, `exitProvenance`, 3 call sites, 2 tests | ⭐ **the union + the 4 producing sites. NO new column, NO cache change, NO event change.** |
| how the kind reaches the exit | a new value carried 6 hops | ⭐ **`exit_price_producer` ALREADY CARRIES IT — 19/19 populated at `B-EXIT-PROVENANCE` close** |
| blast radius of the vocabulary | — | **`kraken_ws_book_mid` appears in exactly 3 files** *(2 source, 1 fence test)* |
| ⛔ **cost** | a fourth object on the provenance payload | ⛔ **HISTORY: existing rows carry the coarse values, so old rows become un-interpretable in the new terms.** A new column leaves history intact. |
| precedent | — | ⭐ **THE UNION ALREADY DID THIS SPLIT ONCE, FOR THIS REASON:** `crypto_ws_book_walk` vs `kraken_ws_book_mid` — *"a walk consumes LEVELS and a mid is (bestBid+bestAsk)/2. Stamping a walk as a mid would be a wrong-object label of exactly the kind this union exists to prevent."* |

⇒ ★★ **BY THE UNION'S OWN RULE, STAMPING A LAST-TRADE FALLBACK `kraken_ws_ticker` IS THAT WRONG-OBJECT LABEL.** ⛔ **I am NOT deciding this. It is the gate.**

## ⛔ THE TRAP THAT KILLS ANY "RE-DERIVE AT THE CONSUMER" VARIANT — INCLUDING r4's
**`price-cache.ts:402-416` `updateFromWebSocket(symbol, price)` sets `ask: existing?.ask ?? price`, `bid: existing?.bid ?? price`.**
⇒ ⛔⛔ **ON A COLD ENTRY `bid === ask === price > 0`, SO `bid>0 && ask>0` RETURNS `mid` FOR A VALUE THAT MAY HAVE BEEN A LAST TRADE.** On a warm entry the sides come from a prior REST refresh **at a different instant**.
✅ **THE KIND MUST BE DERIVED WHERE THE PREDICATE RUNS AND CARRIED. It may NEVER be re-derived downstream.** *(And r4's adapter route dead-ends regardless: `kraken-websocket-adapter.ts:700` emits `{symbol, price, source, producer}` — **bid and ask are dropped at that boundary.**)*

## ⛔⛔ §9.5(b-ii) — **THREE OPEN LEDGER ENTRIES ALREADY COVER THIS. THIS BATCH INSTRUMENTS; IT DOES NOT CLOSE THEM.**
- **`#941` PARTLY-FIXED** — *"Both crypto producers emit a midpoint; they differ by FEED, not by kind. There is no clean print."*
- **`#952` OPEN (mine)** — the `c`-field overwrite. ⛔ **Its fix shape is explicitly NOT pre-judged and cites rule 15: *"the question is which of the two producers is supposed to be the trade print, and whether we need one at all."*** ⇒ **design (B) is a THIRD option `#952` did not list, which is a reason to put it to Langston, not to adopt it quietly.**
- **`#957` OPEN (mine)** — the xStock exit mark is *"untagged"*, and its disposition is **§9.4 (4) a SCHEDULED REVIEW placed at `B-DECIDED-INTENT-INDEX` 3b.g.**
⇒ ✅ **THE SEPARATION THAT MAKES THIS BATCH LEGITIMATE: `#952`/`#957` ask WHAT THE VOCABULARY SHOULD BE — a decision. This batch RECORDS WHAT ACTUALLY REACHED THE EXIT — an instrument, and a prerequisite for answering them from data rather than from argument.** ⛔ **The scope claims neither entry closed.**

## ⛔ AND THE `exit_fee_mode` CARVE-OUT — **r1 FOUND SIX TERMINAL-CLOSE PATHS, NOT THREE**
| # | path | `close_reason` | named in r3? |
|---|---|---|---|
| 1-3 | `active-execution-engine.ts:1077`, `active-engine-service.ts:352`, `active-portfolio-manager.ts:651` | `never_filled` / `engine_stop_cleanup` / caller string | ✅ |
| ⛔ **4** | **`storage.ts:4508-4514`** — `hardResetActiveEngineTables`, BULK `.where(isNull(closedAt))` | `hard_reset` | ⛔ NO |
| ⛔ **5** | **`routes.ts:12941` → `createClosedTrade`** | ⛔ **`reason \|\| 'manual_close'` — `reason` IS `req.body`** | ⛔ NO |
| ⛔ **6** | **`routes.ts:13052` → `createClosedTrade`** | `stranded_clear` | ⛔ NO |

⛔⛔ **AND THE PART THAT WEAKENS r4's ANSWER, HONESTLY STATED: `close_reason` IS CALLER-SUPPLIED UNVALIDATED TEXT on paths 5 and 3.** A row reading `stop_hit` with a null `fee_mode` therefore **does not require a fourth engine writer** — a manual API close whose caller passed that string produces it. ⇒ **`close_reason` IS NOT A DISCRIMINATOR between the stamping and non-stamping paths.**
⚠️ **r4's dating stands as measured** — all 19 closed 2026-07-15 06:18-20:53, the first-ever stamp is 21:43:55 — **but "they predate the writer's deployment" and "they came from a non-stamping path" are BOTH consistent with it, and the repo dates no row.** ✅ **Benign either way: neither needs a fourth writer.** ⛔ **But I may not assert the first as established.**
✅ **CARVE-OUT, FINAL: bound on `closed_at >= 2026-07-15T21:43:55Z` AND exclude all SIX paths by name.**
⚠️ **AND `storage.ts:3128` is `.set(updates)` with NO column whitelist — "exactly one writer" is a CONVENTION at this ref, not a structural guarantee.**

## 🟨 OUT OF SCOPE, FOUND BY r1 — **THE CLOSE STAMP CAN LAND ON THE WRONG ROW**
`active-execution-engine.ts:2196` picks the target row via `trades.find(t => t.openedAt && !t.closedAt)` over `getClosedTradesBySymbol` — **symbol-keyed, unbounded, `openedAt DESC`.** With two concurrently-open rows for one symbol, `closePosition` stamps **the first match, not the position being closed.**
**DISPOSITION: own issue, §9.4 (4) a scheduled review — it needs a concurrency census before it can be dispositioned, and it is not this batch's object.** ⛔ **NOT re-derived beyond reading the two functions; filed as a LEAD, not a finding.**

---

# ✅ r7 — LANGSTON RULED **DESIGN (B)**, WITH FOUR CONDITIONS. ALL FOUR WRITTEN IN. TWO OF MY ARGUMENTS CORRECTED.

> **RULING (2026-08-30T10:16Z, re-read at `58cc5bff8`): design (B) — split the coarse members of the existing closed `PriceProducer` union. NOT a pre-emption of `#952`, PROVIDED it is pure re-description.**
> ⛔ **Board untouched by design: he sets `Review` at Step 4 on the diff, not on a design gate.**

## ⛔ CORRECTION A — **MY EVIDENCE-2 WAS INVERTED, AND HE IS RIGHT. THE CONCLUSION SURVIVES AND GETS STRONGER.**

I argued *"stamping a **last-trade fallback** `kraken_ws_ticker` IS that wrong-object label."* ⛔ **That is backwards.**
✅ **Re-derived at `SYSTEM_IMPACT_MAP.md:319` (its own `CORRECTED 2026-08-29` line):** *"`c[0]` carries the **BBO MIDPOINT** whenever both sides are present — genuine last-trade **only** on a one-sided or empty book."*
⇒ ⭐ **`kraken_ws_ticker` IS A MIDPOINT WEARING A PRINT'S NAME, AND THAT IS THE ARM THAT FIRES ESSENTIALLY ALWAYS.** I argued the case from the rare arm. **The mislabel is on ~100% of rows, not on an edge case.**

⚠️ **AND I AM NOT CARRYING THE NUMBER HE ATTACHED TO IT — `#962`'s "0 in 373,450" IS AN xSTOCK TICKER-SNAP POPULATION.** r3 states that limit in this same document (`§r3 BLOCKER-A`) and says *"OBJ-2 may not cite that zero as covering crypto."* **The crypto last-arm rate is UNMEASURED.**
✅ **The argument does not need it: the SIM line above is STRUCTURAL, not empirical** — *both sides present ⇒ midpoint* is a property of the code, and it holds whatever the arm frequency turns out to be.

## ⭐⭐ ADOPTED — **HIS DECIDING ARGUMENT, WHICH I DID NOT MAKE: (A) BUILDS A SECOND HOME FOR ONE RULE**

Under **(A)**, `exit_mark_kind` travels the same six hops as `producer` **and can contradict it, with nothing that could catch the contradiction.** ⛔ **`producer='kraken_ws_book_mid'` + `exit_mark_kind='last'` is REPRESENTABLE and is a contradiction in terms.**
✅ **Under (B) it is UNREPRESENTABLE — one field, one union, and a missed member is a BUILD FAILURE.** **Re-derived: `toCachedProducer`'s `default:` arm at `live-pricing-adapter.ts:137-140` closes on `const _exhaustive: never = p`.** ⇒ **not a convention, a compile error.**
★ **That is `#641`'s shape — a decided rule needs ONE HOME — and (A) manufactures the second one.**

## ⚠️ CORRECTION B — **MY (B) COST LINE WAS WRONG. THE SAVING IS THE *DOWNSTREAM* CARRY, NOT THE UPSTREAM ONE.**

r6 said *"the four sites where the predicate already runs."* ⛔ **Only ONE has the predicate at its emit site.**
| member | predicate | producer stamped | same scope? |
|---|---|---|---|
| `kraken_rest_engine_fallback` | `active-execution-engine.ts:1305` | `:1309` | ✅ **YES — zero plumbing** |
| `kraken_ws_ticker` | `kraken-v2-translator.ts:57-58` | adapter `:699` | ⛔ needs an upstream carry |
| `kraken_equities_ws` | `equity-spot-archiver.ts:135` | engine `:1236` | ⛔ needs the archiver field-add |
✅ **(B) is still smaller than (A) — but the saving is `PriceTickEvent` + `updateCache` + `CachedPrice` + `getPriceWithFallback`, four structures untouched. Stated honestly.**

⭐ **ONE REFINEMENT, MEASURED, AND I AM STILL TAKING THE FIELD-ADD:** at the crypto WS site the adapter's `parseFloat(safeData.b[0]/.a[0])` (`:682-683`) round-trips **exactly** from the translator's own `bid`/`ask` locals (`:64-65` writes `String(bid)`/`String(ask)`; `String→parseFloat` is exact for doubles). **So re-deriving there would be correct TODAY.**
⛔ **I am not doing it.** That exactness is an **unstated invariant of a function neither end owns** — the moment `a`/`b` are populated from anything but the locals the mid was computed from, the derivation diverges **silently**. **Rule 15: the field-add is the structural answer; the round-trip is the patch.**

## ✅ THE FOUR CONDITIONS — BINDING, WRITTEN INTO THE OBJECTIVES

**1. PURE RE-DESCRIPTION.** ⛔ **SPLIT ONLY. Never merge a member, never delete one, never change which number is produced.** ★ **This is the line that keeps this an INSTRUMENT and leaves `#952`'s question — *which is supposed to be the print, and do we need one* — untouched.** **The moment a member is removed or two mids are collapsed it becomes `#952`'s decision and it goes back to Langston.**

**2. ⛔ `kraken_rest_poller` DOES NOT SPLIT IN THIS BATCH.** **Re-derived: `fetchFromKrakenRest`'s rate-limited branch (`live-pricing-adapter.ts:583-587`) returns `cached?.price ?? null` — a bare number with no provenance.** ⇒ **that producer has THREE arms, not two, and a `_mid`/`_last` dichotomy would stamp a laundered cached value with a confident kind — `#951` wearing a new label, and `#546` exactly.**
✅ **Leave it COARSE, state why in the union comment, and let `#951` split it when it fixes that branch.** *(§9.4 disposition (1) — folded into the work in hand.)*
⇒ ⭐ **THEREFORE THE SPLIT IS THREE MEMBERS, NOT FOUR:** `kraken_ws_ticker`, `kraken_equities_ws`, `kraken_rest_engine_fallback`.

**3. STRICT SUFFIX EXTENSIONS** — `kraken_ws_ticker` → `kraken_ws_ticker_mid` / `_last`.
⛔⛔ **AND THE COLLISION IS NAMED: `kraken_ws_ticker` IS ALREADY A PREFIX OF `kraken_ws_ticker_v1` (`live-pricing-adapter.ts:56`).** ⇒ **PREFIX RECOVERY IS NOT CLEAN. Every cohort query over `exit_price_producer` must ENUMERATE — never `LIKE 'kraken_ws_ticker%'`.**
⛔ **AND MY "COARSE, NOT WRONG" WAS TRUE FOR A HUMAN READER AND FALSE FOR A QUERY.** `F-G-2` at 3c partitions closed trades by exit provenance and **would silently see one cohort as two.**
✅ **SO: RECORD THE SPLIT EPOCH — deploy sha + UTC — IN THE SIM**, the same shape as the deploy-boundary rule, on a vocabulary boundary instead of a clock.

**4. CHANGE-CLASS STAYS `non_architecture` ONLY IF OBJ-3 HOLDS LITERALLY** — **no new emission site, no gate reading `producer`, no behaviour change.** ⛔ **If any of those moves: re-declare `architecture`, and the ledger entry leads with it.**
⚠️ **The `SYSTEM_IMPACT_MAP.md:320` property is the thing being preserved:** *"adding a producer cannot cause a price to be rejected, a position to be skipped, or the escalation rail to fire … A future change that makes any gate read `producer` RE-ARMS it."*

## ⛔ AND THE NOTE THAT GOES IN THE UNION COMMENT ITSELF — **`_mid` MUST NOT READ AS HAVING SETTLED `#952`**
**(B) is ORTHOGONAL to `#952`'s real axis.** `#952` asks **WHICH BBO** the midpoint came from — ticker BBO or depth-10 book — and **both crypto legs come out `_mid` under this split.**
⇒ ⛔ **The union comment must SAY that a `_mid` suffix records the KIND and answers NOTHING about which book produced it.** **Otherwise the split reads as having closed `#952`, which is exactly the pre-emption the ruling is conditioned against.**
