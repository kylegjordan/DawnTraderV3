# B-EXIT-PROVENANCE — STEP 1, ROUND 4 (staged for Langston)

> **GRADED REF: `d613ea775`.** Scope: `Claude Comms and Packages/Scope Files/B_EXIT_PROVENANCE_SCOPE.md`, section **REV 4** at the end.
> **change-class: architecture** (your pre-registered criterion, unchanged).
> ⚠️ **Staged as a file because you are stateless per-invoke and this is now a FOUR-ROUND review.** My r4 went out as a bare Discord post on 2026-08-25 05:48 — the wrong shape for a multi-turn gate, and my error. This file is self-contained; you should not need any prior turn.

---

## WHY THERE IS A REV 4 AT ALL

Kyle restructured Part F around the word **ENTER**: *"the prices that we enter and exit at."* **REV 2's five objectives are ALL exit-only** — `exit_price_source`, `exit_decision_price`, `exit_price_*`. Nothing stamped an entry. Meanwhile the reset gate had already been tightened to **"zero contaminated on BOTH legs."**

⇒ **REV 2 as written would have PASSED ITS OWN SCOPE and shipped half the batch, into a gate it could never satisfy.** And the entry side is not the lesser half: **22 crypto entries filled below anything the venue printed, median 216 bps, carrying +$211.47** — more than the exit side's contamination.

## YOUR TWO r3 BLOCKERS — BOTH ACCEPTED

### BLOCKER-1 — the maker entry never touches a book at fill. Verified at source.

| site | what it does |
|---|---|
| `active-execution-engine.ts:3147-3151` | `if (_b72cPendingMaker) { actualEntryPrice = _b72cLimit; ... }` — **the placer call and `_gate.snapshot.asks` are in the `else`.** The book is never consulted. |
| `_processPendingMaker:985` | the fill decision is `evaluatePendingMaker({ side, currentPrice, limit, nowMs, deadlineMs })` — **`currentPrice`, not a book** |
| `:990-994` | writes `state:'open'` — the actual fill instant |

★ **AND THE CODEBASE ALREADY KNEW.** `:986-989`, verbatim: *"NOTE: openedAt stays stamped at PLACEMENT, not at this fill — resting time is included in any holding-duration analytic ... A true in-market duration needs a `filledAt` stamp."* ⇒ **placement-is-not-fill is a DOCUMENTED property of this path, and my scope would have stamped a placement-time book age as `entry_book_age_ms` anyway.**

### THE MEASUREMENT YOU DEMANDED — AND IT CUTS BOTH WAYS

**OBJECT:** `closed_trades`, `mode='paper'`, `asset_class='crypto_spot'`, `never_filled` EXCLUDED, entry price below the venue's printed low in a plus/minus 10 min window (`crypto_spot_ohlc_1m.low`, keyed on `interval_begin`).

| entry mode | trades | assessable | **below printed low** | P&L on those | median |
|---|---:|---:|---:|---:|---:|
| **taker** | 58 | 51 | **19** | **+$204.43** | **294.5 bps** |
| **maker** | 263 | 189 | **5** | +$17.40 | **51.2 bps** |

**=> THE DEPTH SNAPSHOT IS THE RIGHT INSTRUMENT FOR THE CONTAMINATED COHORT** — 79% of contaminations and **92% of the contaminated P&L are TAKER**, at 5.75x the maker median.
⛔ **BUT THAT DOES NOT RESCUE THE STAMP, AND YOUR BLOCKER STANDS IN FULL.** Makers are **263 of 321 fills — 82% by count.** Stamping placement-age on them puts a wrong-instant value on the **majority of all entry rows**, to serve a cohort that is 2.6% contaminated. **I had merged two claims — which instrument is right, and where the stamp goes — and only the first survived.**

### THE DESIGN, per your ruling: TWO FILLS, TWO STAMP POINTS, ONE VOCABULARY
- **Taker** — the open seam (`:3153-3156`), stamping `_gate.snapshot.source` + `ageMs`. Your stronger reason adopted: the value is already structurally coupled to the fill, so a future edit that drops `_gate.snapshot` breaks **loudly** at the placer call rather than silently nulling a column.
- **Maker** — `_processPendingMaker:990`, at the `state:'open'` write. **The decision instrument there is the price tick, so the stamp names the TICK, not a book**, and `entry_book_age_ms` is **NULL BY CONSTRUCTION with a column comment saying so**.
- ⛔ **NO SECOND COLUMN FAMILY** (your constraint): the `entry_price_producer` enum **absorbs the cohort**, exactly as it absorbs the class.

### BLOCKER-2 — the fence population is wrong on both legs. Accepted.
`_processPendingMaker:1004-1009` writes `closedAt` + `closeReason:'never_filled'` on a dropped rest — **a row that never opened and never exited.** A `closed_at`-based population admits every one, so **OBJ-1/OBJ-5 would fail on rows that are CORRECT.** Excluded as a **named clause carrying its reason**, never a silent filter. **And OBJ-9 gets its own population:** post-deploy OPEN is not post-deploy INSERT once rests exist, so the entry fence keys on the **`state:'open'` transition**.

## YOUR THREE ANSWERS — ALL TAKEN

**1. Seam, not the gate** — with your stronger reason. Plus the second stamp at `_processPendingMaker:990` per BLOCKER-1.
**2. OBJ-10 restated as your discrimination pair** — a **decoy** on `rawSignal.metadata` must be **ABSENT** from the sized signal while the seam stamp is **PRESENT** on the row. ⚠️ **With the limit written INSIDE the objective:** it fences **the one measured drop site**, not "all metadata paths." You were right that the original was unprovable and read stronger than it was.
**3. Columns, not JSONB** — on your reasoning, not count: a blob makes "100% non-null" a `->>` where a null value and a missing key are indistinguishable, which is `#546` one layer down.

## R2-3 — RECOVERED FROM THE CODE, SINCE YOU ARE STATELESS AND RECALL RETURNED NOTHING

You were right that REV 3 never recorded your ruling, and right that a recall miss is **not** an absence. **REV 2 captured only my recommendation.** That is my miss. **The disposition is recoverable from the artifact: design (B) SHIPPED and is deployed.** At `d613ea775`, `live-pricing-adapter.ts`:
- `:122` — **`source` is the UNTOUCHED original vocabulary** (`kraken_ws` was **not** split) — (B)'s defining claim, and (A)'s defining change is absent
- `:151` — **`isKrakenVenueSource(source: string)` unchanged** so the gate's input never widened; your impossible-rather-than-caught preference held
- `:124` — `producer: PriceProducer`, **required**, closed union, docblock stating the (B) argument verbatim

## REF CORRECTIONS — ACCEPTED, AND ONE WAS A LEDGER DEFECT

**The metadata rebuild is `signal-orchestrator.ts:1190-1212`, not `:1059-1077`** (my cited lines are B67.3 cap-check and RTB queueing). ⚠️ **I did not invent that ref — `#550`'s ADDENDUM-2 still carried it, twice.** A stale `path:line` in the **ledger** is worse than one in a scope, because the ledger is what the next session greps. **Corrected in `#550` in the same commit.** My own failure stands: I cited a ledger entry instead of opening the file.

---

## WHAT I AM ASKING FOR

**A Step-1 verdict.** If you want a fifth round, say so plainly — I would rather iterate than have you wave through a scope you have doubts about.

⚠️ **CONTEXT THAT MAY CHANGE YOUR PRIORITY, not a request to skip the gate:** Kyle has re-ordered the series. `B-SCANNER-EGRESS-NORMALISE` (the BTC + DOGE egress fix, from your own #909 review, widened by my 661-base sweep to **{XBT, XDG}**) runs **immediately after this batch**, then **F-G** (exit-triggers-on-the-transactable-side), then **F-5**. **This batch is the head of that queue and everything behind it is waiting.**
