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
| **8** | `OBJ-5`/`#914`: *"VTS has no fill layer — exiting is FREE"* | **The PRICE was free; the COST never was.** VTS subtracts round-trip friction on every real trade — median **1.8083%** (fee 0.80%/leg, slippage 0.05%/leg, spread measured), n=3,527, shadow rows excluded | `vts-runner.ts:1795` composes it, `:3254` applies it. My first read pooled 51,814 SHADOW rows (friction nominal 0 by design, `:904`) with real ones and reported a median of zero. **§8.2** |
| **9** | VTS friction sits **~1.2%** under measured reality | **0.62%** — one leg | Langston correction 2: I doubled a one-leg measurement (0.0112 ÷ 1.8083). Conservative direction, but stated wrong. **§8.2** |
| **11** | §8.1 r2: TEC clamps `exitPrice` **"unconditionally"** at `:275/:284` | **FOUR clamp returns** — `:275` `stop_hit`, `:284` `target_hit`, `:377` `target_hit` (no-trailing branch), `:416` `stop_hit` inside the trailing branch — **and FOUR pass-throughs that already return `currentPrice`**: `:246` `timeout`, `:362` `moonbag_timeout`, `:408` `trailing_stop_hit`, `:411` `break_even_stop` (`:232` `stale_timeout` returns `entryPrice`) | Langston BLOCKER-2, re-derived by me line-for-line. **A 20-close sample drawn from the pass-through reasons is a control that cannot fail** — the criterion is rewritten per return site, §8.7. |
| **10** | Maker-entry rows charged taker: **558**, fix site = ONE (`vts-runner.ts:2103`) | **564, THREE write paths** — crypto inline **107** · crypto twins **439** · xStock inline **7** · xStock twins **11** | Second-reader catch, re-derived at the ref: `maybeOpenTwin` spreads `...chosenTrade` (`:4376-4382`) and `eval-cycle.ts:772` composes taker-priced; **a one-site fix cures 19% while reading as complete.** **§8.3** |

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
| **P2** | ⛔ **HELD — xStock leg, behind 3b.b + 3b.d (§0, §7.4 row 1). NOT BUILT in this deploy.** **`OBJ-1` xStock: read the BID, not the mid.** **This requires a NEW field** — `latestEquityTick` stores `{price, tsMs}` only, and `parseTickerSnap` discards `data.bid` after computing the mark. **The bid IS in the payload and IS buffered to `xstock_spot_ticker_snap`; it is dropped only on the in-memory path** | Scope §17 (the mid exists on both classes), delta 7 |
| **P3** | **Preserve the three-state fallback on both classes.** An absent or zero bid must fall back exactly as the mark does today — **and the fence must be THREE-state** (mid · `_last` · no-write/carried), not two | Scope §18.1 (the three states measured), §22.6 |
| **P4** | **The fence asserts the TICKER mid on xStock, never a "book" mid** | Scope §22.6 — a book-worded fence passes by vocabulary while the defect sails under it |
| **P5** | **`OBJ-0` gains a THIRD read-out: decision price vs contemporaneous venue BBO, PER ARM, reported separately, NEVER netted into the 2×2** | Scope §24.1. ✅ **CONFIRMED by Langston (condition 4): same wording as §22.3, only the justification moved prerequisite → guard.** ★ **The prerequisite dissolving is PRECISELY why the read-out must outlive it — the revert rests on his READING my query, not running it** |
| **P6** | **Every xStock population is reported TWICE — excluding the `00:15` cohort AND unexcluded — both labelled** | Scope §14, `#943`. ⛔ **AMENDED, Langston condition 3: deltas 4 and 5 are load-bearing on the xStock arm and he did NOT re-derive them ⇒ `RULED ON REPORTED FACT`, disqualifying for a proceed on that leg.** ★ **Rather than bounce it, he applied the move §24.1 already made on `#944`: report both, so the exclusion is AUDITABLE AT STEP 8 instead of ASSUMED AT STEP 2.** ⚠️ **The `00:15` rule is still a PROXY and `#943` still owes a positive row identifier** |
| **P7** | **`OBJ-3` — the SUBSTITUTION stands for BOTH classes (§17 refuted the narrowing) — but it is IMPLEMENTED crypto-now, xStock-when-the-hold-lifts** (§7.4 row 1). r2 said "unamended"; that conflated the finding with the deploy | Scope §17; Langston BLOCKER-1 |
| **P8** | **Site 4 is NOT changed by this batch, and the completion report states that it exists, is dead, and reads a third price source.** ➕ **RECIPROCAL RIDER (Langston condition 1, the B-MBIM shape): the report NAMES the six per-strategy exit helpers (`strategy-engine.ts:1151-1199`) as DELIBERATELY UNTOUCHED**, so a later grep across them does not read them as a MISSED call site of `evaluateTECExit` | **FINDING A1 (§2.1)** |
| **P9** | **Completion-report language fixed in advance:** MAY claim *the decision reads the transactable SIDE of the price we hold*; **MAY NOT** claim *the exit price is transactable* | Scope §22.6, §24 |

| **P10** | **`OBJ-5a` — VTS books the OBSERVED mark at exit, BOTH lanes — CRYPTO ROWS ONLY THIS DEPLOY:** `vts-runner.ts:3238` and `:3915` consume the evaluation's `currentPrice` instead of `decision.exitPrice` **when `trade.assetClass === 'crypto_spot'`; xStock rows keep the clamp until 3b.b lands** (§7.4 row 2 — the observed xStock mark can BE the 00:15 stub, and booking it would import `#943` into VTS learning in the favourable direction). The class seam is on the BOOKING, not the decision (`OBJ-4` intact), and is named as a temporary seam with its removal owed to 3b.b; **null-arm:** no live mark ⇒ keep `decision.exitPrice` (TEC returns the entry-fallback on `stale_timeout`, `tec-evaluator.ts:227-237`), never NaN. `evaluateTECExit` untouched (`OBJ-4`) | **§8.1** (both consumption sites, reader-verified exactly two), **§8.4** (null-arm, defensive with maxHold OFF) |
| **P11** | **`OBJ-5b` — mode-aware entry fee at THREE write paths:** (i) crypto inline openTrade `:2103+` after `_vtsEffectiveMode` (`:2085`); (ii) the TWIN overlay — **re-priced INSIDE `planTwin` (`pending-maker-logic.ts:98-136`), NOT in `maybeOpenTwin`** (Langston FINDING: `entryFeeRate` is already mode-derived there, the function is pure and unit-testable on both branches, and splitting one mode-derived computation across the seam and its caller is `OBJ-4`'s principle failing in miniature). `planTwin` gains two inputs — the chosen leg's `frictionCost` and `entryFeeRate` — and its overlay gains `frictionCost = chosen.frictionCost + (twinEntryFee − chosen.entryFeeRate)` plus the fee fractions. ⚠️ **`maybeOpenTwin` is ONE seam called from BOTH lanes — `vts-runner.ts:2270` AND `eval-cycle.ts:1211`** — so this re-prices xStock twins too; covered by the fee exemption, §7.4 row 3; (iii) xStock `eval-cycle.ts` after `_xEffectiveMode`, mirroring (i). **Formula graded on the diff: `feeEntry(mode) + feeRateTaker + slippage×2 + spread`.** NOT `cost-model.ts:198`. ➕ **`costFeeFraction` has FOUR writers, all in scope: `vts-runner.ts:2128` (openTrade), `:2355` (the at-open `Phase10TradeRecord` — r2 named neither it nor its divergence), `:4218` (`registerOpenVtsTrade`), `eval-cycle.ts:1037`** | **§8.3** (origin split 107/439/7/11), Langston 06:03 conditions 1 and 3 |
| **P12** | **`OBJ-5b` 5-col reconciliation:** `costFeeFraction := (feeEntry+feeExit)/2` so the open-trades renderer's `fee×2` (`vts-runner.ts:5824/:5826`, same `_f` both legs) reconciles exactly with ZERO schema change — **declared cost, now correctly sized: each displayed fee leg reads 0.60% on a maker row whose `entry_fee_rate` says 0.40%, ON THE OPEN-TRADES TABLE ONLY.** ⛔ **r2 cited `export-csv.ts:327` — WRONG: it reads a payload that never receives the fractions** (Langston (a), re-derived: the closed record `:3302-3341` carries `frictionCost` `:3317` + `entryFeeRate` `:3340`, `persistRealPriceTrade` `:3382-3454` carries `frictionCost` `:3414` (`chosenEntryMode :3452` / `entryFeeRate :3453` inside the range) — **no fractions, no spread**). Mitigation, same diff: write `costEntryFeeFraction`/`costExitFeeFraction` into `context` jsonb AND **carry all fractions field-by-field into the closed record and the persist payload (`:3382-3454`)** (disposition (1), Langston §13 — P12's own reconciliation surface). ⛔ **WHICH ROW THE `OBJ-5b` RECONSTRUCTION TEST READS, stated: `vts_open_trades.context` — which PERSISTS on `closed=true` rows (measured: 3,407 closed rows carry the split today) — NEVER the closed JSON payload, which cannot reconstruct without the spread** | **§8.3**, reader item 5, Langston (a). ⚠️ **Judgement call — arithmetic ruled sound, citation corrected** |
| **P13** | **Admission UNCHANGED, declared:** `:1795` birth and `:2014` `minViableDistance` keep the taker-priced estimate. `chosenMode` settles `:1829-1855` BEFORE `:2014`, but the EFFECTIVE mode (`:2085` marketable fallback) does not — taker is the conservative arm for every still-possible outcome, and re-pricing the guard would change ADMISSION. `:2141` is comment-only (#558 A3) | **§8.5**, Langston 06:03 condition 2 (ordering stated explicitly) |
| **P14** | **`OBJ-5c` — ONE `calibration_epoch` bump, source `vts`, wildcard row, via the canonical `module_constants` write path;** completion report carries the bump line (Langston amendment 2 in `calibration-epoch.ts`). Both comment corrections ride the diff. **The 09-07 armed window re-measures the residual (Langston cond. b) and it ships NAMED in the record (cond. a)** | **§8.6** — all 12,988 real VTS rows sit in ONE epoch today |

**NOTHING IN THIS PLAN IS `UNAUDITED`.** *(P10-P14 added r2 on Kyle's fold directive 2026-09-02.)*

---

## 5. DISPOSITIONS FOR WHAT THE AUDIT SURFACED OUTSIDE THE PLAN (§9.4)

| item | disposition |
|---|---|
| **FINDING A1 — dead exit path, third price source** | ✅ **RULED (Langston, condition 1): disposition 2, home `PHASE_19_PLAN` 3h — as an EXPLICITLY NAMED item carrying BOTH modules and BOTH line ranges, stating that its disposition is decidable WITHOUT 3h's verdict.** ⛔⛔ **AND MY 'SAME MODULE' PREMISE WAS HALF WRONG — the half that decides the home.** Only `monitorActiveTrades`/`checkTradeExitConditions`/`getCurrentPrice` are `#928`'s module; **the other ~95 lines are in `strategy-engine.ts`, which is not merely live — it is the DETECT-METHOD HOME for the active path.** ★ **3h owning the HTTP intent path does not own a dead limb in `strategy-engine` BY ADJACENCY, and the limb's deadness is INDEPENDENT of 3h's answer: if 3h keeps the HTTP path, the exit loop is still dead and still a rewire-bypass hazard.** ⚠️ **Named, not implied — module adjacency is not a decided disposition** |
| ⛔ **CONDITION 2 — LANGSTON'S OWN FINDING: two governed docs document the DEAD loop as LIVE** | ✅ **FIXED THIS TURN.** `SYSTEM_MANUAL.md:4556` and its mirror `sections/PHASE5_TRADE_EXECUTION_AND_LIFECYCLE.md:129` carry a two-engine comparison table listing *“Monitoring │ `monitorActiveTrades()` via strategyEngine”* with nothing marking it dead. ★ **That is exactly the artifact a future session traces forward from and re-wires.** §17 content correction, riding with A1 to the same home. ⚠️ **AND HE CAUGHT THAT MY §1 TABLE CLAIMS I READ AND CORRECTED `SYSTEM_MANUAL` FOR `#941` — SAME FILE, THIS ROW UNCAUGHT.** ⇒ ★ **“I read the file” is not “I read the file FOR THIS COMPONENT”; `#941` sent me to the ticker node and I never swept the engine-comparison tables.** |
| **The crypto/xStock sidedness anomaly** | **(1) folded in — OPEN, six candidates eliminated** (Scope §18-§20) |
| `#943` · `#945` · `#941` · `#942` | filed, homed, placed |
| **`B-SLIPPAGE-NEVER-MEASURED`** (proposed 2026-09-01) | ⛔ **(5) WITHDRAWN same day, carrying the citation:** INVARIANT F2 *"constants, not configurable"* + BUG-028/Batch 18J `5eae1601` made 0.05%/leg the canonical constant BY DIRECTIVE 11.3B. I reported the fix as the defect — third rediscovery in this arc, same cause (code census, no provenance read). Langston accepted the withdrawal. **What survives is two stale comments, folded into P14.** |
| **`B-VTS-COST-TRUTH`** (minted 2026-09-02) | ⛔ **(1) FOLDED INTO THIS BATCH as `OBJ-5a-c` (Kyle: *"fold it into F-G-2"*).** It was `OBJ-5`'s own "change it" branch wearing a new batch's name; card deleted, standalone scope retired, content is §8 + P10-P14. |
| **`DE/USD` `target_hit` at 00:15:03 off a spiking ask** (found dispositioning alert `df0dbd23`) | **(2) evidence attached to `#943`** — the favourable-direction twin of the fill-above-stop class; no new issue. |

---

## 6. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The batch's core case survived and got stronger: on crypto, every one of 24 exits since the book fix landed below its stop, while tokenized stocks scatter evenly around theirs. But four numbers the batch was written on had to be corrected, one finding of my own was withdrawn within hours of filing it, and the scope narrowing I proposed was refuted at the code by Langston.

**What the plan does.** Read the price we could actually sell at instead of the midpoint, on both asset classes, keeping the existing fallbacks intact and fencing all three of their states rather than two. Add one extra read-out so the change can be checked against the venue's own quote, per arm. Exclude a known bad-data cohort from the tokenized-stock numbers, and fix in advance what the closing report is allowed to claim.

**What the fold adds (r2).** The VTS half of the same question: VTS will book the price it actually observed at exit instead of the perfect trigger price, and a trade it entered as a maker will be charged the maker fee it actually paid — at all three places that fee is written, because 80% of the affected trades are the comparison twins a one-site fix would have missed. One epoch marker on the deploy separates before from after. Nothing here blends VTS with paper trading; it makes VTS price what VTS itself did.

**What it deliberately does not do.** It does not touch a fourth exit path found during this audit — a separate, dead implementation reading a third price source — beyond recording that it exists and belongs to work already planned elsewhere.

---

## 7. THE THREE INPUTS LANGSTON REQUIRED THIS DOCUMENT TO ABSORB BEFORE IT REACHES HIM (master-order row 1 condition)

### 7.1 `EXIT_PATH_MACHINERY_AUDIT` §14.5 — MY OWN AUDIT CONTESTS `OBJ-1`, AND THIS IS MY ARGUMENT TO DEFEND, NOT HIS RATIFICATION TO CITE
§14.2 measured (n=77,060 wide xStock rows, two controls) that the overnight widening is **SYMMETRIC** — the bid sits as far below value as the ask sits above it. §14.5 then says, as a **proposal**: *"the exit TRIGGER should read a value estimate — the last trade, or the mid — and the FILL should be modelled at the transactable side, depth-walked. Today we use one number for both, and it is the wrong one for each job."* **That is in direct tension with `OBJ-1` as scoped (the DECISION reads the bid).**
**Position, stated so it can be graded:** the plan does NOT pre-decide this. `OBJ-0` — shadow first, switch second — is the instrument, and **its arms are now TRIGGER-side vs FILL-side, not merely mid vs bid.** P1/P2 implement the bid-trigger as the SHADOW candidate; the switch waits on `OBJ-0`'s discordant cell. **What makes the crypto arm defensible on today's evidence:** post-epoch crypto exits are ONE-SIDED (24/24 below stop, pre-audit §15) — a fill-side signature — while the symmetric widening was measured on xSTOCK, whose legs are already held (§0). **What would reverse it:** a crypto `OBJ-0` discordant cell that grows under the bid-trigger arm. ★ **The founding design (§8.2, deleted 2026-01-18, `485699a2f^`) already had the right shape — decide on one price, fill at another — and `OBJ-5a` is precisely that shape applied to VTS: the trigger stays TEC's, the BOOKED price becomes the observed one.**

### 7.2 THE `3b.f` CARVE-OUT — RESTATED FOR THE PLAN, INCLUDING THE FOLDED ITEMS
> **`F-G-2` may not use `observedAt`, `cachedAt`, or any age-derived value as a sample filter or covariate in its before/after arms.**
Answered in scope §0 for `OBJ-0`; **extended here to P5 (the per-arm venue-BBO read-out), P6 (the `00:15` double-report), and the `OBJ-5` 09-07 re-measure — none may filter or stratify on age.** If a revision needs one, `#951` reattaches by construction and §0 is re-argued first. *(Why it is not a confound: a stale bid and a stale mid are stale identically — `#951` refreshes the clock on an unchanged price and moves neither arm relative to the other.)*

### 7.3 `#952` — THE PRINT CONTROL IS DEAD; THE BID CONTROL SURVIVES, AND P5 MUST USE THE RIGHT ONE
`kraken-v2-translator.ts:52-58` overwrites the v1 `c` field with `(bid+ask)/2` — **there is no clean trade print in the crypto ticker producer.** ⇒ **any control that compares `kraken_ws_ticker` against `kraken_ws_book_mid` compares TWO MIDPOINTS and cannot detect what it was built to detect.** Narrowed by Langston and re-derived: `getTickerWitness` (`depth-source.ts:107`, `#911`) reads `crypto_spot_ticker_snap` off a SEPARATE socket and returns RAW `bid`/`ask`, never a mid — **F-G-2's §2 control is bid-vs-bid and survives.** ⇒ **P5's third read-out is BOUND to `getTickerWitness` raw sides; it may never cite the `c` field or the `kraken_ws_ticker` producer as a print.** The two code comments asserting the opposite (`live-pricing-adapter.ts:47-49`, `kraken-websocket-adapter.ts:943-944`) are `#941`'s unfixed leg, homed there.

### 7.4 ⛔ THE xSTOCK SEAM — THREE DISPOSITIONS, EACH WITH ITS GROUND (Langston BLOCKER-1: *"shared pipeline is not a boolean"*)
| # | leg | xStock disposition | ground |
|---|---|---|---|
| 1 | **`OBJ-1`/`OBJ-3` exit DECISION reads the bid** (P1 crypto · P2 xStock field · P7) | ⛔ **HELD** — crypto ships; **P2 is not built and `OBJ-3`'s xStock implementation waits** until 3b.b + 3b.d | `depth-source.ts:89-93` — no second feed can contradict an xStock PRICE (§0) |
| 2 | **`OBJ-5a` VTS books the observed mark** (P10, both lanes) | ⛔ **HELD on xStock ROWS via a class seam on the BOOKING** — xStock VTS rows keep `decision.exitPrice` | the observed xStock mark can be the `00:15` stub (`#943`, `DE/USD` `target_hit` at 00:15:03 off a spiking ask); booking it would move `#943`'s contamination INTO VTS learning. **Seam removal is owed to 3b.b and is named there** |
| 3 | **`OBJ-5b` maker fee** — xStock inline site `eval-cycle.ts:772/:1032` **AND the shared twin seam `maybeOpenTwin` ← `eval-cycle.ts:1211`** (P11 ii/iii) | ✅ **EXEMPT — SHIPS for both classes** | a DB-resolved fee rate is not a price and does not come off `xstock_spot_ticker_snap`; `eval-cycle:772` is the same `fee×2+slippage×2+spread` shape as `:1795` (Langston (b), GRANTED, wording extended to the twin seam as he required) |
| 4 | **`OBJ-5c` epoch bump** (P14) | ✅ **SHIPS — `vts` wildcard row** | the fee change touches VTS rows of BOTH classes, so a class-scoped row would under-mark |

**Consequence for §7.1:** its crypto-arm argument carries ONLY because rows 1 and 2 are held — stated so the dependency is visible, not implied.

---

## 8. `OBJ-5` FOLDED — THE VTS AUDIT FINDINGS THE PLAN ITEMS P10-P14 FALL OUT OF

**8.1 Exit booking (P10).** `tec-evaluator.ts` clamps `exitPrice` at FOUR return sites — `:275`/`:416` to the stop, `:284`/`:377` to the target (header `:18-19` — design, not a bug) — **and passes `currentPrice` through at four others** (`:246`, `:362`, `:408`, `:411`; delta 11). *(r2 said "unconditionally" — wrong; only `stop_hit`/`target_hit` traverse a clamp.)* Paper DISCARDS the clamp and depth-walks (`active-execution-engine.ts:2036-2056`); **VTS alone consumes it as the booked fill** at exactly two sites — `vts-runner.ts:3238` (real lane → `:3253-3254` grossPnl/netPnl → `:3285` twin record → `:3317` closed archive → `:3391` persist) and `:3915` (shadow → `shadowClose` `:3919`). **Reader-verified: every other `exitPrice` occurrence is downstream of those two pushes, a helper parameter, a type, or a `null` literal.** Measured cost of the clamp: median 0.1202% benefit, 19 of 21 post-deploy crypto `stop_hit` fills worse than trigger.

**8.2 The cost model (delta 8/9).** `vts-runner.ts:1795` `frictionCost = fee×2 + slippage×2 + spread`; `:3254` `netPnl = grossPnl − frictionCost`. Real trades (shadow excluded) n=3,527 with components: fee **0.8000%**/leg (Tier-1 taker, DB-resolved via `resolveFeeRates`), slippage **0.0500%** (canonical constant — F2, 18J), spread 3,029 distinct measured values. Residual after the clamp fix: 0.0612%/leg on n=21 — **stated as the exit-leg, crypto, `stop_hit` subpopulation, the adversely-selected tail, NOT a global figure** (Langston).

**8.3 Maker-entry fee (P11/P12; delta 10).** `cost-model.ts:198` returns `feeRateTaker` unconditionally; `vts-runner.ts:2113` records the mode-aware `entryFeeRate` on the SAME row. **Provenance:** `resolveFeeRates`' comment — *"Maker is resolved + carried so the future Phase-19 maker-entry flip is a value change, not a redesign — it has zero live consumers today (the engine takes liquidity; the model prices taker both legs)"* — was TRUE at writing; P19-B7.2b/c then built VTS maker entries. **Rule-24 outcome (3): intent overtaken.** Origin split of the 564 maker rows (crypto inline 107 · crypto twin 439 · xStock inline 7 · xStock twin 11) — the twin path: `maybeOpenTwin` `{...chosenTrade, ..., ...plan.overlay}` (`:4376-4382`); overlay (`pending-maker-logic.ts:79-85, 125-135`) carries `chosenEntryMode`/`entryFeeRate` but NO friction ⇒ the twin inherits the chosen leg's friction under the opposite stamp. **Post-fix, no path re-prices after birth:** a pending maker fills at its limit (`markPendingMakerFilled`, state-only) or drops never-filled; the maker→taker flip is pre-birth only (`:2085`).

**8.4 Null-arm (P10).** `currentPrice` is PER-TRADE in both loops (`:3002`, `:3873`) and can be null; `evaluateTECExit` then returns no-exit or, past maxHold, `stale_timeout` with `exitPrice = entryPrice`. Keeping `decision.exitPrice` on null books the entry-fallback exactly as `:3227` logs it. With the maxHold valve OFF (`:3111`/`:3891` → `Infinity`) the arm cannot be reached — **defensive, not routine.**

**8.5 Admission (P13).** Ordering, stated: `:1795` birth (taker) → `:1829-1855` `chosenMode` → `:2014` `minViableDistance` (pre-EFFECTIVE-mode) → `:2085` effective mode → `:2103+` record (re-priced) → `:2287-2332` `VirtualSignal` record → `:2336-2369` at-open `Phase10TradeRecord` (**not** the closed archive — that reads `trade.frictionCost` at `:3317`, reached via the trade record).

**8.6 Epoch (P14).** `calibration-epoch.ts`: per-source integer in `module_constants`, seeded 1, bump-scope rule = the changed SOURCE only (`vts`), canonical write path, completion-report line mandatory. Live: `calibration_state = pre_calibration_xstock_2026_05` on all 12,988 real rows — one epoch.

**8.7 The `OBJ-5a` verification criterion, REWRITTEN PER RETURN SITE (BLOCKER-2).** The r2 criterion — *"first 20 post-deploy real VTS closes book exit = the mark"* — **cannot fail**, because `trailing_stop_hit`, `break_even_stop`, `timeout` and `moonbag_timeout` already book `currentPrice` today. ⇒ **The sample is drawn ONLY from clamp-traversing reasons — `stop_hit` and `target_hit` — and reported PER `exit_reason`, with the clamp-traversal count stated** (*n stop_hit, n target_hit, of N closes in the window*). Pass = every crypto `stop_hit`/`target_hit` with a live mark books `exitPrice ≠ trigger` where the mark differed, and every pass-through reason is unchanged (a negative control the r2 wording lacked). xStock rows (seam, §7.4 row 2) are reported as HELD, not as passes.

**LANGSTON RECORD (r3 → CLEARED 07:31).** `STEP 2 CLEARED at 840df8a5d · Review=Approved · three Step-4 conditions: (1) `:409/:412` → `:408/:411` (applied r3b), (2) persist range `:3382-3454` (applied r3b), (3) the completion report states the open-trades table renders 0.60/0.60 per leg on a maker row while context carries 0.40/0.80 — same row, two surfaces.` Counts, the 3,407 context rows and the 0.1202%/0.0612% figures stay RULED ON REPORTED FACT for Step 4.

**LANGSTON RECORD (r2 → r3).** `CHANGES-NEEDED 07:21 · re-derived by him at a1d665b7a / 34ee695dc · 3 conditions ✅ · BLOCKER-1 (xStock seam) → §7.4 + P2/P7/P10 · BLOCKER-2 (four clamp returns) → delta 11, §8.1, §8.7 · (a) P12 citation corrected + closed-payload fractions folded (1) · (b) fee exemption GRANTED, extended to the twin seam · (c) §7.1 accepted as a position, dependent on §7.4 · FINDING: twin re-price moved into planTwin (P11 ii).` Counts 107/439/7/11 remain `RULED ON REPORTED FACT` — Step-4 material.

**READER RECORD.** `REVIEWER r1: object+claim (scope + repo) · 3 of 5 derivations scope-correct, 2 scope-incomplete · changed: three write paths (twin + xStock added), OBJ-3 justification corrected, :2352 mislabel fixed, null-arm marked defensive, 5-col display cost declared.` Both incomplete hits RE-DERIVED at the ref before amending; the origin split is the measurement that confirmed them.
