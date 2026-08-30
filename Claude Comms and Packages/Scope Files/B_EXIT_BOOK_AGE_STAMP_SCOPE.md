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
| **OBJ-1** *(r2)* | **On every TAKER close, record the age of the book the FILL walked, into a NEW column `exit_fill_book_age_ms`** — both asset classes. ⛔ **NOT into `exit_book_age_ms`, which holds DECISION-time age (see BLOCKER-1).** | ⛔ **BOTH cohorts asserted:** a post-deploy TAKER close has a non-null fill-age matching an independent reconstruction; a post-deploy MAKER close is null **with `exit_fee_mode='maker'`**, which is *no book walked*, not *not recorded*. |
| **OBJ-2** *(r2)* | **Record the mark's KIND in a NEW column `exit_mark_kind`** (`mid` / `last`). ⛔ **NOT by widening the enumerated source/producer vocabulary — `:813-816` prohibits it.** | A post-deploy close carries the kind; a forced-`last` unit test yields `last`. |
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
