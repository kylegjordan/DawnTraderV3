# F-G-2 / `B-EXIT-TRANSACTABLE-SIDE` — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

> **ONE document, audit FIRST, plan falls out of it. Langston signs off once.**
> **THE AUDIT BODY IS IN THE SCOPE FILE at `B_EXIT_TRANSACTABLE_SIDE_2_SCOPE.md` §9-§24** — it was written there across 2026-08-29 as the measurements ran, and is NOT duplicated here. **This document carries the deltas, the census, and the plan.**

---

## 0. PREVIOUSLY STATED vs NOW — EVERY NUMBER THAT MOVED, AT THE TOP

> **A number corrected silently reads as a number that never changed. The reader is deciding whether to approve a plan built on these.**

| | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| **1** | `OBJ-6` provenance coverage **~3.6%** (12 of 334 crypto, 9 of 232 xStock) | **100% since 2026-08-27** (13/13 crypto, 8/8 xStock) | **Denominator error.** The 3.6% divided by LIFETIME closes, nearly all of which closed before the column existed. Those are not misses; they are not in the population. **§13.1** |
| **2** | The below-stop gap is a **half-spread** story (~0.0545%) | **2.23 half-spreads** — the spread explains **at most ~45%** | Measured against the venue half-spread, n=19. **§10.2** |
| **3** | `BLOCKER-3`: **no xStock stop reference exists** (0 of 144) | **`closed_trades.stop_loss` is populated 144/144** | The 0-of-144 is `original_stop_price`, read from perishable in-memory state. **§11.** Langston holds `BLOCKER-3` OPEN anyway — **a usable field is not a wired instrument** |
| **4** | `OBJ-9`: the above-stop tail is **entirely pre-epoch**, so `OBJ-0` is ungated | **TRUE FOR CRYPTO ONLY** (0 of 24 post-epoch). **xStock: 6 of 7** | The crossed-book fix was a **crypto book** fix; xStock rides a different feed. **§12.3, §14** |
| **5** | xStock post-epoch above-stop median **+3.055%** | **Driven by three `#943` rows.** Excluding them the rest sit **at** the stop | `#943`'s 00:15 cohort. **§14** |
| **6** | **Crypto exit price sits 0.4229% below the venue quote** (`#944`, HIGH) | **WITHDRAWN — a TIMING ARTIFACT.** Continuous instrument, n=492, median **0.0000%** | **§23-§24.** `#944` withdrawn same day; `B-BOOK-BBO-DIVERGENCE` dissolved; F-G-2 sequencing reverted |
| **7** | `OBJ-3` narrowed to crypto-only, on the ground that the substitution is **undefined on xStock** | **REFUTED. `OBJ-3` stands, BOTH classes** | `_eqTick.price` IS a mid (`equity-spot-archiver.ts:130-137`). **§17** |

---

## 1. THE SIX SOURCES — WHICH I READ, NAMED

| # | source | read? |
|---|---|---|
| 1 | **CODE at `origin/migration/aws-supabase`** | `kraken-v2-translator.ts:42-68` · `kraken-websocket-adapter.ts:680,700,910-918,945,1081` · `equity-spot-archiver.ts:108-140` · `active-execution-engine.ts:1230-1243,1634,1701-1702,1757,1793-1824,2211-2226` · `strategy-engine.ts:1106-1135` · `trading-engine.ts:677-713` · `system-alerts.ts:554-597` |
| 2 | **RUNTIME LOGS + DATABASE** | `/var/log/dawntrader/out__2026-08-29_06-24-29.log` read at the second (`#943`); 843k `ENGINE_LIVE_PRICE` lines for the `#944` instrument; ~20 psql measurements |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | read **and CORRECTED** — §2.1 asserted the ticker handler emits a last-trade print (`#941`) |
| 4 | **`SYSTEM_MANUAL.md`** | read **and CORRECTED** — it asserted the ticker channel is *"trade-based"* (`#941`) |
| 5 | **BATCH REPORTS + LEDGER** | searched before each filing; `#940` withdrawn as a duplicate of `#943`; `#912`'s companion checked before filing `#942` |
| 6 | **`bridge/canonical/`** | **CONSULTED, AND THE ABSENCE IS THE FINDING: no document mentions the midpoint at all** — the corpus predates `b4c0d2d67` (2025-12-30), so it documents a system in which prices are traded prices. **Scope §9.4** |

**THE FRESH-READER LOOP WAS NOT RUN, AND THIS IS NOT PRESENTED AS COVERED.** This session operates under a standing instruction not to spawn subagents unless asked, which overrides the skill's standing authorisation. **Every load-bearing claim was instead put to LANGSTON, who re-derived the mechanism ones himself at the ref** (`equity-spot-archiver`, `kraken-websocket-adapter`) **and overturned two of them.** That is a real process boundary rather than a simulated one — **but it spends HIS time instead of a cheap reader's, and the substitution should be visible rather than silent.**

---

## 2. ENTRY-POINT ENUMERATION — REPO-WIDE, BEFORE THE TRACE

> **Tracing forward from one entry point structurally cannot discover a second one.**

**Every exit-decision implementation, repo-wide, tests excluded:**

| # | implementation | reached from | shares `evaluateTECExit`? | price it reads |
|---|---|---|---|---|
| 1 | `active-execution-engine.ts:1634` | `:1456`, driven by `setInterval` at `:653` | yes (`aee:1705`) | crypto: adapter cache (book BBO mid) · xStock: `_eqTick.price` (ticker mid) |
| 2 | `vts-runner.ts:3101` real resolver | VTS loop | yes | VTS cache |
| 3 | `vts-runner.ts:3882` shadow resolver | VTS shadow | yes | own fetch |
| 4 | **`strategy-engine.ts:1106`** | **`trading-engine.ts:696`, inside `monitorActiveTrades` (`:677`)** | **NO — a SEPARATE IMPLEMENTATION** (its own stop/target comparison plus per-strategy exits) | **`this.kraken.getTicker(symbol).c[0]` — the v1 REST ticker, a THIRD source** |

### 2.1 FINDING A1 — THERE IS A FOURTH EXIT-DECISION SITE AND `OBJ-4` DOES NOT NAME IT

`OBJ-4` says *"DO NOT FORK THE SHARED EXIT DECISION — `evaluateTECExit` … THREE CALL SITES."* **Site 4 is not a call site of it at all — it is an independent implementation with its own comparison and its own price source.**

**AND IT IS DEAD, ESTABLISHED WITH PRESENCE-EVIDENCE RATHER THAN INFERRED:** `grep -rn "monitorActiveTrades" --include=*.ts server client shared`, tests excluded, returns **exactly ONE line — its own definition at `trading-engine.ts:677`. Zero callers.**

**AND MY FIRST CENSUS OF IT WAS WRONG.** I grepped `tradingEngine.` — the instance name — and got a single diagnostics string, which would have read as *"the whole module is orphaned."* **`TradingEngine` the CLASS is imported at five live sites** (`routes.ts:10,15068` · `command-router.ts:3` · `intent-executor.ts:243,482`). **The MODULE is live; the EXIT LOOP inside it is not. One grep pattern is not a census.**

**RULE-18 LEGACY: a dead exit path, reading a third price source, that would bypass everything F-G-2 does if it were ever wired.** `#928` (the HTTP intent path, `intent-executor` → `TradingEngine`) is the same module and is already homed at `PHASE_19_PLAN` 3h.

---

## 3. COMPONENT CENSUS — THE OBJECT `OBJ-1` CHANGES

**The object: the price the exit decision reads, per class.**

| question | crypto | xStock |
|---|---|---|
| **who WRITES it** | `handleV2BookUpdate` → `kraken_ws_book_mid` (`adapter:918,945`) · `handleV2TickerUpdate` → `kraken_ws_ticker` (`adapter:700`) — **both stamp `source:'kraken_ws'`** | **EXACTLY ONE: `parseTickerSnap` → `latestEquityTick.set` (`equity-spot-archiver.ts:137`).** **Structural, not a grep result — the map is a module-private `const` at `:112`, never exported** |
| **who READS it** | `livePricingAdapter.getPriceWithFallback` → the exit eval | `getLatestEquityTick` (`:115`) → `aee:1230` |
| **who MUTATES it** | last-writer-wins between two producers | single writer; **three states** — mid · `_last` fallback · **no-write/carried (`#636`)** |
| **who DELETES it** | n/a (cache overwrite) | n/a |
| **who SCHEDULES against it** | `setInterval` (`aee:653`) | the same interval |

**TWO PRODUCERS OVER ONE CACHE KEY REQUIRE A MUTUAL-EXCLUSION CHECK, AND THERE IS NONE** — that is `#741`, already known and already addressed at the field level (`*_price_source` vs `*_price_producer`). **Re-stated because `OBJ-1` writes a NEW consumer onto that same key.**

---

## 4. THE IMPLEMENTATION PLAN — EVERY ITEM BACK-REFERENCES ITS AUDIT FINDING

| # | plan item | falls out of |
|---|---|---|
| **P1** | **`OBJ-1` crypto: read the BID, not the mid.** Source = the mini-book's `bestBid` (`adapter:910`), which already exists beside the midpoint at `:918` | Scope §9 (the substitution), §15 (crypto 24/24 one-sided) |
| **P2** | **`OBJ-1` xStock: read the BID, not the mid.** **This requires a NEW field** — `latestEquityTick` stores `{price, tsMs}` only, and `parseTickerSnap` discards `data.bid` after computing the mark. **The bid IS in the payload and IS buffered to `xstock_spot_ticker_snap`; it is dropped only on the in-memory path** | Scope §17 (the mid exists on both classes), delta 7 |
| **P3** | **Preserve the three-state fallback on both classes.** An absent or zero bid must fall back exactly as the mark does today — **and the fence must be THREE-state** (mid · `_last` · no-write/carried), not two | Scope §18.1 (the three states measured), §22.6 |
| **P4** | **The fence asserts the TICKER mid on xStock, never a "book" mid** | Scope §22.6 — a book-worded fence passes by vocabulary while the defect sails under it |
| **P5** | **`OBJ-0` gains a THIRD read-out: decision price vs contemporaneous venue BBO, PER ARM, reported separately, NEVER netted into the 2×2** | Scope §24.1 — Langston's guard, retained after the `#944` retraction |
| **P6** | **Every xStock population excludes `to_char(closed_at,'HH24:MI')='00:15'`**, labelled as a PROXY | Scope §14, `#943` |
| **P7** | **`OBJ-3` implemented for BOTH classes, unamended** | Scope §17 — the narrowing was refuted |
| **P8** | **Site 4 is NOT changed by this batch, and the completion report states that it exists, is dead, and reads a third price source** | **FINDING A1 (§2.1)** |
| **P9** | **Completion-report language fixed in advance:** MAY claim *the decision reads the transactable SIDE of the price we hold*; **MAY NOT** claim *the exit price is transactable* | Scope §22.6, §24 |

**NOTHING IN THIS PLAN IS `UNAUDITED`.**

---

## 5. DISPOSITIONS FOR WHAT THE AUDIT SURFACED OUTSIDE THE PLAN (§9.4)

| item | disposition |
|---|---|
| **FINDING A1 — dead exit path, third price source** | **(2) ADD AS AN ITEM TO AN EXISTING BATCH.** Rule 18: legacy gets a decided disposition, not a shrug. **Proposed home: `PHASE_19_PLAN` 3h (`#928`)**, which owns the same module and already asks whether the HTTP intent path should exist at all. **Langston's call, not mine** |
| **The crypto/xStock sidedness anomaly** | **(1) folded in — OPEN, six candidates eliminated** (Scope §18-§20) |
| `#943` · `#945` · `#941` · `#942` | filed, homed, placed |

---

## 6. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The batch's core case survived and got stronger: on crypto, every one of 24 exits since the book fix landed below its stop, while tokenized stocks scatter evenly around theirs. But four numbers the batch was written on had to be corrected, one finding of my own was withdrawn within hours of filing it, and the scope narrowing I proposed was refuted at the code by Langston.

**What the plan does.** Read the price we could actually sell at instead of the midpoint, on both asset classes, keeping the existing fallbacks intact and fencing all three of their states rather than two. Add one extra read-out so the change can be checked against the venue's own quote, per arm. Exclude a known bad-data cohort from the tokenized-stock numbers, and fix in advance what the closing report is allowed to claim.

**What it deliberately does not do.** It does not touch a fourth exit path found during this audit — a separate, dead implementation reading a third price source — beyond recording that it exists and belongs to work already planned elsewhere.
