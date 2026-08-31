# THE PRICING-TRUST SERIES — EVERY PIECE, ONE TABLE (2026-08-31, CC-C)

> **Kyle asked for all ~25 pieces in one place with a state and a proposed order.** ⚠️ **THE TRUE COUNT IS 29, and the gap is worth stating rather than rounding away: the series is 15 (piece 8 SPLIT into `F-G-1`/`F-G-2` on Langston's 2026-08-27 ruling, and `5a` was minted as a close gate) and the sub-batch block is 14 — Kyle correctly remembered **13**, and the 14th (`3b.f-a`) is one **I added today**.**
> **THE GOAL, unchanged:** when this series closes we can trust the **entry and exit prices** of VTS simulated trades and active paper trades. **Live mode is Phase 21.**

---

## ✅ DONE — 8 pieces

| # | name | what it does | closed |
|---|---|---|---|
| **0** | `B-BOOK-TRUNCATE-HOTFIX` (`#507`) | The order book never trimmed itself to the depth we subscribed to, so it drifted out of shape. **Crossed books 32.03% → 0.** ★ **This is the "book order fix"; it also created the epoch every later measurement is split on.** | `e6f7c70b3` 08-22 |
| **1** | `F-A` `B-MBIM-SWITCH-ON` | The alarm for book drift was written on day one and had **never been switched on.** Drift now 0.000-0.028% against a 0.2% line; checksum 18,758/18,758. | `afb7d326c` |
| **2** | `F-F(a)` `B-OBSERVATION-EPOCH` | Fixes the date from which measurements count, so a fix's before/after cannot be quietly re-based. | `afb7d326c` |
| **3** | `B-EPOCH-KEYING-PARITY` | The epoch rule had reached **one dashboard reader out of four.** All four now agree. | `30808c6c0` |
| **4** | `B-PHANTOM-FILL-RECONSTRUCT` | Adds the columns that let a fill be reconstructed. Columns only — deliberately no backfill. | migration applied |
| **5** | `F-B` `B-EXIT-PROVENANCE` | **Every trade now records which price source drove it and how stale that price was** — 14 columns. A trade proves its own prices instead of being reconstructed later. | 08-30, 19/19 |
| **5a** | `B-EXIT-PROVENANCE-TICKER-RETENTION` (`#911`) | Keeps a **second, independent** price feed on each row, off a separate socket — so a row can't check a suspect number against itself. | `ed86a758e`, gate discharged |
| **6** | `B-SCANNER-EGRESS-NORMALISE` | **The Bitcoin + Dogecoin fix.** They had never traded at all — the scanner sent Kraken a symbol form it rejects. | 08-30 |

## ⏳ STARTED, NOT FINISHED — 3 pieces, all in observation windows

| # | name | what it does | state |
|---|---|---|---|
| **8a** | `F-G-1` `B-GRID-REPRESENTABILITY` | Rounds every entry, stop and target to a price **the venue can actually quote.** Split off from `F-G-2` because the rounding MOVES stops (worst 12.96%), which would have destroyed `F-G-2`'s before/after measurement. | ⏳ **deployed 08-28 · window closes 09-04** |
| **3b.h** | `B-EXIT-BOOK-AGE-STAMP` (`#961`) | Records **how old the book was** that priced each exit, and which side it used. Changes no behaviour. | ⏳ **deployed 08-30 · window closes 09-06** |
| **3b.f** | `B-PRICE-AGE-TRUTH` (`#951`) | When our own limiter declines to ask Kraken, the stored price was recorded as *observed now*. **It now carries its true age.** | ⏳ **deployed 08-31 · window closes 09-07** |

## ⛔ VOID — 1 piece

| # | name | why |
|---|---|---|
| **3b.c** | `B-EXIT-TRIGGER-FILL-PARITY` (`#959`) | Opened by me 08-30 as CRITICAL, **withdrawn 08-31**: it was a rediscovery of `3b.b`, and it reported the intended design (decide on one price, fill at another) as a defect. |

---

# 📋 THE PROPOSED ORDER — 17 remaining

> **Reasoning stated once:** Kyle's own re-order (2026-08-26) is *"6, 8, then 11"*. 6 is done. **So 8 is next** — and 8 is now two halves with different gates. **After that, the pieces that UNBLOCK 8's second half come before the pieces that merely follow it.** The tail keeps Kyle's dependency order untouched.

| order | # | name | what it does | state · why here |
|---|---|---|---|---|
| **1** | **8b** | **`F-G-2` `B-EXIT-TRANSACTABLE-SIDE` — CRYPTO half** | The exit decision reads a **midpoint** while a sell actually fills on the **bid**. Make the decision name the side we transact on. | **Step 1 APPROVED.** Crypto proceeds on the `F-G-1` soak alone (Langston 08-30). **Step-2 doc is NOT soak-gated and has 3 inputs from the last 48h not in its scope** ⇒ ~4 days of work inside the 4-day window, finishing as the soak reads out. |
| **2** | **3b.d** | **`B-XSTOCK-BOOK-LADDER`** (`#949`) | Subscribe to the xStock **order book**. It was confirmed to exist in May, given a named objective, and **never subscribed to** — we have one top-of-book row where crypto has ten levels. | ⛔ **NOT STARTED, NO CARD. The real prerequisite of 8b's xStock half.** ⛔ **CAPTURE-ONLY until 09-06/09-07** — a live subscription mid-window changes what `3b.h` is measuring. |
| **3** | **3b.b** | `B-XSTOCK-FEED-SANITY` (`#943`) | **The stub book.** One side of the quote walks away when the underlying market is shut, the midpoint follows it, and the engine closes positions on a price nobody would trade at. | **Scope written, OBJ-1/2/3 already answered.** ✅ **Unblocked today by Kyle's four-session decision.** Its identifier blocker also lifted (8 of 11 recent closes now carry the decision book). |
| **4** | **3b.e** | `B-XSTOCK-LIVE-FEED` (`#950`) | The xStock feed was built as a **passive archive forbidden to share state with trading** — and became the trading feed without a decision. | not started · follows 3b.b + 3b.d |
| **5** | **11** | `F-5` — per-strategy reach structure | Gives each strategy its own reach parameter instead of one global number. **BUILD only, behaviour-neutral**, seeded at today's value. | **Kyle's 4th.** The FIT stays gated on `F-E` regardless of order. |
| **6** | **7** | `F-C` — staleness bound (`#743`) | Derives the **maximum age** a price may have before we refuse to act on it — from `F-B`'s stamped data rather than choosing a number. | needs 5 (done) + 3b.f's window |
| **7** | **9** | `F-D` — VTS accessor + isolation | VTS uses the shared price accessor **zero times**, against an invariant saying all consumers must. | queued |
| **8** | **10** | `F-E` — detector + disposition | Tiers the trade history: **A clean / B contaminated / C unassessable** — so calibration stops being fitted to bad prices. | needs 5 live + 6 done (both are) |
| **9** | **12** | `F-F(b)` — the reset gate | The decision to **reset the learning baseline**. Gated on: book alarm clean N days · stamp on 100% of closes · ≥50 assessable · zero contaminated on both legs. | **last, unchanged** |
| **10** | **3b.f-b** | `B-PRICE-AGE-REFUSAL` | Makes a stale re-served price **non-actionable**, not merely honestly labelled. Carved out of `3b.f`. | gated on `#971` (= 3b.l) |
| **11** | **3b.l** | `B-TWO-CACHE-INTENT` (`#971`) | The canonical design said **one** rate-governed price cache as the single source of truth. There are two. Establish which was intended. | not started · gates 3b.f-b |
| **12** | **3b.g** | `B-DECIDED-INTENT-INDEX` (`#956`) | A session cannot answer *"was this behaviour intended?"* with one search. **Today's void `#959` is its 4th measured instance.** | not started · Langston: if a 5th lands before the series closes, **it jumps** |
| **13** | **3b.f-a** | `B-OPENTRADE-REFRESH-LANE` (`#977`) | The 2-second price refresh lane built for open positions is running and **nothing subscribes to it.** | Kyle placed it; **Langston's recommendation to Kyle is that it moves behind the F-series** — his ruling, not mine to make |
| **14** | **3b.m** | `B-PROVENANCE-LOSS-CENSUS` (`#976`) | Provenance is lost at substitution boundaries across the pricing layer. | ⚠️ **does not reach `F-G-2`** — Langston: re-home after row 5 |
| **15** | **3b.j** | `B-SCANNER-DEDUPE-DEAD-TABLE` (`#965`) | The scanner's *"already has an open position"* check reads a table the active path does not write. | ⚠️ does not reach `F-G-2` |
| **16** | **3b.k** | `B-CHANGE-CLASS-PARSER` (`#968`) | The governance checker cannot read the most natural way to write a change-class line. | ⚠️ does not reach `F-G-2` |
| **17** | **3b.i** | `B-DISPATCH-STAGING-VERIFY` (`#964`) | A failed copy followed by a fallback puts a **stale file under the right filename** in front of the reviewer. | ⚠️ does not reach `F-G-2` |

---

## ⛔ WHAT I AM LEAST SURE OF — the parts I want Langston to rule on

1. **Is 3b.d really 2nd?** It is the only unstarted prerequisite of `8b`'s xStock half, but Langston has already told me *"3b.d is right work; it is not next"* and that its sibling `3b.b` was a decision, not a batch. **Kyle has since MADE that decision**, which is new information he ruled without.
2. **Should 3b.b now outrank 3b.d?** Its scope is written and its objectives answered; the decision that blocked it is given. **It may be the cheapest real progress on the board.**
3. **Is putting 3b.f-b / 3b.l at 10-11 right**, or do they belong with the F-tail?
4. **Seven of these have no board card**, so they have been invisible. **That is a process failure of mine**, and it is why this table exists.
5. ⚠️ **Three observation windows close 09-04, 09-06, 09-07.** Nothing that changes the price path may deploy inside them without splitting a population at a deploy boundary.
