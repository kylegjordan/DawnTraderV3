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

# 📋 THE ORDER — ⛔ SUPERSEDED HERE, AND DELIBERATELY NOT RE-COPIED

> ⛔⛔ **THE LIVE ORDER LIVES IN ONE PLACE ONLY: `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` §⓵ (the MASTER ORDER block at its top).**
> **The list below is MY 2026-08-31 DRAFT, kept as the record of what was proposed. LANGSTON CHANGED FIVE OF ITS PLACEMENTS the same day and added a row 0.** ⚠️ **DO NOT WORK FROM IT.**
> ★ **Why it is not simply overwritten with the approved order: two copies of a sequence is the `#641` shape, and the copy that gets read is never reliably the one that got updated.** This document's value is the DESCRIPTIONS; the scratch list owns the ORDER.
> **What he changed:** `3b.b` up to 2 and `3b.d` to 3 *(order by WHEN THE GATE LIFTS, not by piece size — 3b.b's gate was a decision Kyle made)* · `3b.l` up to 6 · `3b.f-b` down to 8, **after** `F-C`, because `F-C` DERIVES the bound `3b.f-b` ENFORCES · `F-F(b)` to LAST of the thirteen · **plus a ROW 0 that is not a batch: the `ws-equities` book re-probe — ✅ DONE 2026-08-31, `TSLA` 20/21 levels, thin names 1-2.**

## (draft, superseded — retained as the record)

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

---
---

# PART 2 — EVERYTHING ELSE STILL OPEN ON THE SCRATCH LIST (NOT among the 29)

> **Kyle asked for the remaining scratch-list steps that are NOT one of the 29 pricing-trust pieces. THERE ARE 31.** Two scratch items ARE already inside the 29 and are excluded here to avoid double-counting: **A15 (`#964`) = row 3b.i**, and **A7 (`#618`) = plan row 4.b**.
> ⚠️⚠️ **STATUS IS AS THE LEDGER RECORDS IT. I HAVE NOT RE-VERIFIED EACH AGAINST THE CODE TODAY** — and this ledger has been wrong in the expensive direction: **A7 sat marked *"build pending / highest priority and UNTOUCHED"* for nine days after the build had shipped.** ⇒ **every row below needs a status re-derivation before it is worked, not treated as fact.**

## 🟥 GO-LIVE BLOCKER — 1

| id | name | what it is |
|---|---|---|
| **`#734`** | **`B-DRAWDOWN-ANCHOR-COHERENCE`** | ⛔⛔ **A PHASE-21 BLOCKER THAT READS HARMLESS FROM THE PAPER SIDE.** The health endpoint has returned `critical` since the 08-12 re-anchor. **It THROWS in live mode** — tripped twice, independently. |

## ⛔ DECISIONS THAT ARE KYLE'S — 7 (CC-C must not pick these alone)

| id | name | the question |
|---|---|---|
| **A12 / `#624`** | globalRegime at-open stamp | **Why absent on 37% of crypto and 26% of xStock opens?** Never explained; Kyle asked for it reviewed. |
| **A13 / `#616`** | AMR friction input is ~half a constant | The fee contributes 26.7 of the live 56 every cycle and carries **zero information about conditions**. Langston's gate: no weight change until ruled. |
| **A14 / `#626`** | what is `costs` on the VTS path | A live tooltip says *"VTS rows may use a different composition"* and **nobody has traced it**. |
| **C1** | 24-hour trade caps | Force-close trades that have not closed in 24h? Folds in the 9-day-open positions. |
| **C2** | Friday early-shutdown for xStocks | The active lane attempts fills **after** the daily close; only the freshness rail stops it. |
| **C3** | xStock off-hours liquidity → **time-of-day admission gating** | ★★ **DIRECTLY ADJACENT TO THE SESSION DECISION KYLE MADE TODAY** — categorise each xStock by full-day activity and decide whether ADMISSION should be time-gated. |
| **A6** | slippage / negative-cost presentation | ✅ **ALREADY RULED 08-20** — (a) + the measurement half of (b). ⇒ the WORK is D2.7 below. |

## 🔧 CC-C FIX WORK — 9

| id | name | what it does |
|---|---|---|
| **A9** | six fabricated `\|\| 50000` balance fallbacks | ⛔ **TWO OF THE SIX SIZE POSITIONS** (`routes.ts:14852`, `:15017` → `calculateRiskAmount` → `quantity`). **A ghost default deciding trade size.** |
| **A10** | the client re-invents what the server stopped faking | Fabricates `status:'OK'` and a zero portfolio when the API errors. **A false all-clear is worse than an error.** |
| **A8 / `#620`** | engine-vs-persisted profit check | The one P&L invariant never checked: **does the net the engine COMPUTED equal the net actually SAVED?** |
| **A11 / `#622`** | nothing verifies a completion report's governance list | Mine claimed the System Manual was updated when it had not been touched. **Mechanically decidable.** |
| **A4** | exploration anneal-counter defect | Counts open and orphaned rows as closed — reads 188 against a true 184. |
| **A5** | crypto orphan close-path | 3 rows (AVAX, ETH, MET) written at open, position gone, **close details never filled in**. |
| **A2** | exploration-lane marker column | Show which trades came in on the exploration lane. Display-only; data already stored. |
| **`#733`** | `B-CANONICAL-CORPUS-ACCURACY` | 4 of 14 canonical files are machine-regenerated while the rules file calls the directory frozen. **Docs only.** |
| **`#900`-`#904`** | parity + hygiene *(5 issues, one row)* | SQL↔TS parity fence · the epoch value resolves two ways (4/534) · two unscoped epoch readers · the portfolio endpoint. |

## 📦 QUEUED BATCHES / ARCS — 13

| id | name | what it is |
|---|---|---|
| **D2.6 / D6 / `#703`** | **commodity-perp capture** | Gold, silver, copper, WTI, nat gas + CHF. **Capture-only. Kyle GO given 08-20.** ★ **THE ONE ITEM WHOSE COST GROWS WHILE IT WAITS** — every day is data not collected. |
| **D2.7** | A6's display batch | Costs against ACTUAL fills, price-improvement as a credit, + the signal-staleness metric. **Kyle already ruled the shape.** |
| **D4** | `B-SIZING-DEC-RESTORE` resumption | Delete two dead config knobs, derived-slots display, **+ `#698` paper-slots (~$150 x 15-20)**. |
| **D5** | the storage arc | `B-DAILY-CUTOVER-SWEEP` (`#688`/`#689`) + **`B-STORAGE-REPORT` (`#697` — Kyle's standing storage page)**. |
| **D2** | `P19-B-PERPFEED` close-out | The sweep: orphan drop, 4 dead retention keys, the tail counter. |
| **D3** | `P19-B-FEEVIABILITY` tail | Per-strategy reachability package → batch close. **Date-paced, not hands-on.** |
| **D2.5** | the `#618` build | ✅ **Two of three legs SHIPPED** (measured 08-30). **Denominator + guardrail adjudication remain** = plan row 4.b. |
| **D1** | live-investigation drain | ◐ mostly done; **open: Langston's ruling on `#696`.** |
| **D7** | BloFin venue research | Relaunched 08-20; **report owed to Kyle.** |
| **D8** | strategy-combinations study | Deferred from FEEVIABILITY batch two; **never started.** |
| **D9** | seven untriggered 19.4.5 observational gates | Deferred **by design** until their triggers fire; re-check at every batch close. |
| **D10** | fake-wins follow-through | ⚠️ **CC-B's lane** — tracked here for visibility only. |
| **B1** | flow-document verification pass | Re-verify every stage of `ACTIVE_PATH_FLOW.md` against the code. **I own that document.** |

## ⚠️ OWED INSIDE AN ALREADY-CLOSED BATCH — 2

| | |
|---|---|
| **`B-BALANCE-TRUTH` residual** | the `netPnl ?? pnl` family of six converts **only with a fence asserting the two columns agree** — identical on all rows today, but **redundant-today decays silently**. |
| **rides `#734`** | `active-portfolio-manager.ts:505` keeps its 1,000-row cap — held out by Langston deliberately. |

---

## ⇒ WHAT THE TWO TABLES SAY TOGETHER

**29 pricing-trust pieces + 31 other open items = 60. Eight are done; three are in observation.**
⛔ **THE HONEST HEADLINE: the pricing-trust series is what stands between us and trustworthy entry/exit prices, and it is 8 of 29 complete.**
★ **Only three things in Part 2 plausibly COMPETE with the series for priority:** `#734` (it throws in live mode), **`#703`** (capture-only, already approved, and its cost grows daily), and **C1/C2/C3** — the session-behaviour decisions, which are **adjacent to the decision Kyle made today** and would be cheap to settle in the same breath.
