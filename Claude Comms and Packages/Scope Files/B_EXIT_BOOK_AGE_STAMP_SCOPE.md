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
| **OBJ-1** | **On every close, record the AGE of the book the fill actually walked** — for **both** asset classes, xStock included. | A post-deploy xStock close has a non-null book-age; the value matches an independent reconstruction on the same row. |
| **OBJ-2** | **Record the KIND of the mark that drove the decision** — `mid` or `last`. | A post-deploy close carries the kind; a forced-`last` unit test yields `last`. |
| **OBJ-3** | ⛔ **NO BEHAVIOUR CHANGE.** Nothing is gated, refused, delayed or re-priced. | The exit-decision and fill code paths are byte-identical apart from the two writes; **a before/after replay produces identical exits.** |
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
⚠️ **BUT the crypto path takes its book from `getBookForFill`, and `:1381-1392` sets the columns null for xStock DELIBERATELY, with a comment calling it *"the honest value and not a missed read"* because *"that class has no order book."*** ⛔ **THAT COMMENT IS NOW WRONG IN A LOAD-BEARING WAY — the class DOES consult a book at fill time, and its age is exactly the number we need.** ✅ **Correcting it is in scope; changing what it selects is not.**

---

## 5. PROVENANCE READ (MANDATORY 1.b)

| object | intent | disposition |
|---|---|---|
| `exit_book_age_ms` / `exit_book_mid` | added by `B-EXIT-PROVENANCE` so a trade proves its own prices | **(2) relevant, needs updating to today's intent** — the xStock null was correct when written and is not now |
| `getDepthSnapshot` | one interface, two class-keyed implementations | **(1) still relevant and correct** — untouched |
| `assessWarmth` | the entry's staleness gate | **(1) correct** — **NOT called here; Phase B owns that question** |
| the `_eqTick` mark | `P19-B8.5`, the venue mark for a class with no REST | **(2)** — the KIND tag is the update |

⚠️ **AND THE CORPUS LIMIT, STATED: `#956` established that decided intent also lives in CODE COMMENTS, which a scope/report search structurally cannot reach.** ⇒ **The `D1` marker was found that way. Before any Phase-B change, the in-code markers get read.**
