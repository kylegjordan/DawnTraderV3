# B-EXIT-BOOK-AGE-STAMP — SCOPE (Step 1)

**Batch:** `B-EXIT-BOOK-AGE-STAMP` · **change-class:** non_architecture · **Owner:** CC-C · **Phase:** 19
**Created:** 2026-08-30 · **Plan:** `1-system-manual/XSTOCK_PRICING_PLAN.md` **Phase A**

> ⭐ **THIS IS THE ONE STEP THAT CANNOT BE WRONG UNDER ANY LATER DECISION.** It records two facts and changes no behaviour. **Langston's ruling, 2026-08-30: split each step at the intent seam — instrumentation is intent-independent and ships now; behaviour changes wait for the decided-intent index.**
> ⚠️ **Kyle, same day: *"we're accumulating more and collecting more data that isn't right, and we're not working on collecting the right data."*** ✅ **This batch is that sentence answered.**

---

## 1. WHY — TWO THINGS WE CANNOT CURRENTLY MEASURE, AND ONE FINDING THAT RESTS ON A RECONSTRUCTION

⛔ **`#961` — the largest defect on the plan — is currently RECONSTRUCTED, not read.** The exit fill walks an order book and **never records how old it was.** `bookAgeMs` and `bookMid` are **NULL BY CONSTRUCTION on xStock** (`active-execution-engine.ts:1381-1392` — `_posClass === 'xstock_spot' ? null : getBookForFill(...)`). **Measured: crypto 15/78 populated, xStock 0/26.**
⇒ **So `#961`'s headline — 22 of 243 closes filled on a book older than the entry gate's own 15 s limit, worst 1,554.9 s — was rebuilt by joining the ticker archive after the fact.** ⛔ **A finding that large should not rest on a reconstruction.**

⛔ **`#962`/`W12` — the mark is `(bid+ask)/2` when both sides exist, else `last`, and it is UNTAGGED.** Measured 0 fallbacks in 373,450 rows across both sessions — **but that zero is only readable because bid/ask presence can still be reconstructed today.** ⇒ **If the fallback ever fires we have no way to SEE it.** *(Langston's disposition: fold the tag in here.)*

⛔ **`W7` cannot be costed at all without this** — whether a given exit read a republished mark or a fresh tick **leaves no trace**, because the cache is never persisted.

---

## 2. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** *(r3)* | **On every TAKER close — INCLUDING `forceClosePosition`, which IS one (r3 BLOCKER-B) — record the age of the book the FILL walked, into a NEW column `exit_fill_book_age_ms`.** ⛔ **NOT into `exit_book_age_ms`, which holds DECISION-time age (BLOCKER-1).** | ⛔ **BOTH cohorts asserted, and the coverage query CARRIES `B-EXIT-PROVENANCE`'s CARVE-OUT (r3 MATERIAL-C): it EXCLUDES `close_reason='never_filled'` and the three paths that never call `closePosition`, because `exit_fee_mode` is THREE-valued (107 live nulls) and a binary partition false-reds on all of them.** ⛔ **AND CRYPTO IS VERIFIED BY A PAIRED LOG LINE AT THE FILL SITE, NOT BY RECONSTRUCTION (r3 MATERIAL-D) — nothing persists the crypto WS mini-book, and the nearby ticker archive is a DIFFERENT FEED off a SEPARATE SOCKET.** |
| **OBJ-2** *(r3)* | **Record the mark's KIND in a NEW column `exit_mark_kind`** (`mid` / `last`), **derived at BOTH sites that compute it — `equity-spot-archiver.ts:135` AND `kraken-v2-translator.ts:55-59` (r3 BLOCKER-A).** ⛔ **NEVER inferred from a consumer's variable name: `kraken-websocket-adapter.ts:681` is called `lastPrice` and holds a MID.** ⛔ **NOT by widening the source/producer vocabulary — `:813-816` prohibits it.** | A post-deploy close carries the kind; a forced-`last` unit test yields `last`. |
| **OBJ-3** *(r2)* | ⛔ **NO BEHAVIOUR CHANGE.** | ✅ **A DIFF PROPERTY, NOT A REPLAY** (a replay cannot cover the maker leg, which is where BLOCKER-2 lives): **no changed line feeds a price, a gate, a comparator or an `await` that did not already exist.** `_closeSnap` is already computed and already awaited on the taker branch — a CHECKED FACT. |
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

✅ **DECISION, MADE IN SCOPE AND NOT AT IMPLEMENTATION TIME: A NEW COLUMN — `exit_fill_book_age_ms` — alongside the existing `exit_book_age_ms`. NOT one column plus a discriminator.**
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

⛔⛔ **`dt-deploy` runs `db:migrate` between build and restart, so those SQL comments are what an analyst reads from `\d+ closed_trades`.** ⇒ **Following r2 would have corrected two copies, edited a correct comment, and left the DATABASE ITSELF asserting *"xStock has no book"* directly beside a new `exit_fill_book_age_ms` column populated on xStock — GAP-4's own named failure mode landing on GAP-4.**
✅ **RESOLUTION: FOUR sites — `:1389`, `:1924`, `shared/schema.ts:1809`, and the SQL comments — in one pass. `depth-source.ts` is REMOVED from the list.**
➕ **AND ONE MORE, SAME FIX: `exit_book_age_ms`'s DB comment reads *"Age of the order-book snapshot at close"* with NO INSTANT QUALIFIER.** ⛔ **Once a second at-close age column exists, that comment is precisely what makes the two mixable — the risk BLOCKER-1 chose a new column to avoid.** ⚠️ **And it is live already: 8 of 239 maker closes carry a non-null `exit_book_age_ms` (decision-time, from `getBookForFill`, which runs for crypto regardless of maker/taker) while their `exit_fill_book_age_ms` will be NULL.**

## ✅ CHECKED AND CLEAN — recorded so it is not re-derived
- **OBJ-3's load-bearing claim HOLDS:** `_closeSnap` is genuinely already computed and already awaited at `:1997`; **no new `await`.** ⚠️ *Mechanical only: it is `const`-scoped to the `else` block `:1996-2013` while the persist is at `:2227`, so it must be hoisted.*
- **§4's "a write, not a fetch" HOLDS for xStock** — `getDepthSnapshot` already runs for the class.
- **BLOCKER-1's column split is correct, and no existing reader would mix them** — `exitBookAgeMs` has no client consumer; **the only mixing surface is the column comments, which is MATERIAL-E.**
- **Deploy ordering is safe** — `db:migrate` runs before restart, so the columns exist before the new code does.
