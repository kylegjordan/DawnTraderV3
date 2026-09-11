# B-EXIT-BOOK-AGE-STAMP — COMPLETION REPORT (CLOSED 2026-09-07)

# ✅ CLOSED 2026-09-07 — all four criteria PASS. Converted from the progress report; the observation record is preserved in full below (§9 carries a criterion I misjudged, §11 the correction).

**Batch:** `B-EXIT-BOOK-AGE-STAMP` (`#961` + `#962`) · **change-class:** `non_architecture` · **Owner:** CC-C · **Phase 19, plan row 3b.h**
**Deployed:** `104fa755bf28b852c7c648081aa32a9683424d9f` at **2026-08-30T12:05:09Z** — `dt-deploy --by CC-C`, engine resumed, identity asserted, migration applied in 818 ms.
**Plan:** `1-system-manual/XSTOCK_PRICING_PLAN.md` **Phase A**

> ⛔ **WHY THIS IS A PROGRESS REPORT AND NOT A CLOSE: both objectives are only observable on a POST-DEPLOY CLOSE, and at the time of writing there are ZERO.** The last close before the deploy was **2026-08-30T09:51:40Z** — 2.2 hours earlier — so the cadence is slow enough that this is an OBSERVATION WINDOW, not a wait. **3 positions are open.**

---

## 1. WHAT THE BATCH IS FOR
The exit fill walks a depth ladder and **never recorded how old it was**, so `#961`'s headline — 22 of 243 closes filling on depth older than the ENTRY gate's own 15-second limit, worst 1,554.9 s — was **RECONSTRUCTED** by joining the ticker archive after the fact. And the price that DROVE an exit was recorded only by which handler produced it, never by **what kind of number it was**, so a midpoint and a last trade were indistinguishable downstream (`#962`/`#952`/`#941`).
**This batch makes both READ instead of rebuilt. It changes no behaviour: nothing is gated, refused, delayed or re-priced.**

## 2. WHAT SHIPPED
- ⭐ **Design (B), Langston-ruled:** the mark's KIND is recorded by **splitting three coarse `PriceProducer` members** into `_mid`/`_last`, **not** by a new column — `exit_price_producer` already carried a value on every row, and two fields recording overlapping facts can contradict each other with nothing to catch it.
- **NOT split, each for a stated reason:** `kraken_ws_book_mid` (no last-trade arm at all) · `kraken_ws_ticker_v1` (unreachable, `#742`) · **`kraken_rest_poller` — THREE arms, not two: its rate-limited branch returns a bare cached price (`#951`).**
- **One new column `exit_fill_depth_age_ms`** — named `depth`, not `book`, because on xStock the value is a **ticker-snap ROW age**, not an order-book age.
- **One predicate, one home** — `markKindOf` in `server/services/market-data/mark-kind.ts`. The rule previously existed in **four files with no two sharing a line**.
- **Six live-database column comments corrected**, including one asserting an absence that 18 rows refuted.

## 3. STEPS COMPLETED, WITH EVIDENCE
| step | evidence |
|---|---|
| **1 Scope** | r1→r7. **Langston ruled design (B) with four conditions** 2026-08-30T10:16Z. ⭐ **GAP-3 WITHDRAWN — I had cited a prohibition at lines that are the WS broadcast payload, inverting the union's documented property.** |
| **2 Audit + plan** | `B_EXIT_BOOK_AGE_STAMP_PRE_AUDIT.md`, audit r1→r5, **14 plan items, nothing `UNAUDITED`**. **CLEARED 11:00Z with three conditions**, all applied. |
| **readers** | **FOUR fresh readers, all HIT, all re-derived at the ref.** They overturned: my "pure passthrough" claim, my live-skip-chain over-correction, my "tests would fail the build" claim, my log placement, and my NULL discriminator. |
| **3 Implementation** | `279f4c2c6` + `1770137e0` + `104fa755b`. Fence **16/16**, neighbours **14/14**, tsc baseline **384 = 384**. |
| **4 Review** | **APPROVED 11:52Z**, two comment-only conditions, both applied at `104fa755b` and **verified by Langston at the ref**. |
| **5 CI** | **4/4 green** on `104fa755b` (run `33310293378`). |
| **6 Deploy** | `dt-deploy` **refused first on a dirty worktree** — `bridge/canonical/mapping-regime-strategy.json`, a **timestamp-only** rewrite by `sync-canonical-bridge.ts` into the supposedly-frozen corpus (`#948`, live mechanism). Named disposable, redeployed OK. |
| **7 Verification** | **Claude-in-Chrome, no login.** App renders, paper mode ACTIVE, no application console errors. ⭐ **THE LOAD-BEARING ONE: live marks UPDATE between reads — Net P/L +$10.77 → +$10.84, open positions $385.63 → $385.70.** **If a split member had landed in `toCachedProducer`'s null arm the cache write would be suppressed and these would freeze.** |

## 4. ⛔⛔ THE PRE-REGISTERED CLOSE CRITERION — WRITTEN BEFORE THE DATA ARRIVES. DO NOT DATA-MINE.

⛔⛔ **WINDOW REPLACED 2026-08-30, SAME DAY, BY ITS AUTHOR — AND THE CHANGE IS TO THE *STOPPING RULE*, NOT TO THE BAR (Kyle, and he is right).**
⛔ **WAS: "20 post-deploy closes OR 7 days." That is a ROW COUNT applied to a FUNCTIONAL question, and it is the pattern Kyle called out: *"if we see the functionality works for a few, we see it for them all… I don't know why we have to keep waiting."*** 
✅ **NOW — A COVERAGE RULE: close when every combination the mechanism can produce has been OBSERVED ONCE, whichever comes first with 7 days.**
| # | cell | why it is the variation that matters | status |
|---|---|---|---|
| **V1** | a **crypto TAKER** close | the only cell where `exit_fill_depth_age_ms` must be NON-NULL — it is C2's whole assertion | ⏳ |
| **V2** | a **crypto MAKER** close | the structural NULL, the cell that would read as a failure without the carve-out | ✅ **SPX/USD 12:08:18Z** |
| **V3** | an **xStock** close (either leg) | the ONLY cell that exercises the `kraken_equities_ws_*` split; crypto can never reach it | ⏳ *(venue shut until Sun 20:00 ET)* |
| ⛔ **V4** | a close whose producer is **`kraken_rest_engine_fallback_*`** — **OR** a cited reason it cannot fire in the window | ⛔⛔ **ADDED SAME HOUR, SELF-APPLIED AFTER LANGSTON CAUGHT THE IDENTICAL DEFECT IN MY F-G-1 REQUEST.** This is the THIRD producing site, and V1-V3 do NOT guarantee it is sampled: the REST fallback fires **only when the WS cache is stale**, which is a **RATE**, not a code path a taker/maker/class split reaches. | ⏳ |

★★ **THE TEST THAT PRODUCED V4, AND IT IS PER-ASSERTION, NEVER PER-BATCH (Langston, 2026-08-30): ask of EACH assertion separately whether its failure mode is a CODE PATH — a few examples settle it — or a RATE, where only a count does.** ⛔ **A single criterion can contain BOTH. `C2`'s null-vs-non-null is a code path; `C1`'s producer coverage contains a rate-limited arm.** ⚠️ **My first version of this coverage rule applied the functional test to the whole batch and missed that — the same over-application Langston refuted in my F-G-1 request, caught here before it shipped rather than after.**
⭐ **THE BAR IS UNCHANGED: C1-C4 below are word-for-word what they were before any data existed. Only the stopping rule moved, and it moved from a count to a list of cells DERIVED FROM THE MECHANISM — what the code can produce — not from what happened to pass.**
⚠️ **STATED BECAUSE IT IS THE OBVIOUS OBJECTION: this was edited AFTER one close landed. That close (V2) satisfied a cell the ORIGINAL criterion already contained, and no assertion was weakened, added or removed. If any C-assertion had moved, this would be data-mining and the edit would be illegitimate.**
*(Original anchor unchanged: `closed_at > 2026-08-30T12:05:09Z`.)*
✅ **ARMED AS A SELF-FIRING ALERT — `65a1379e-a382-43fe-960a-9e47f68e76eb`, state `scheduled`, fires `2026-09-06T12:05:09Z`, severity `warning`.** ★ **The alert carries this whole criterion in its body, including both carve-outs and the enumerate-never-`LIKE` rule, so whoever picks it up does not need this file to act — and the window cannot quietly elapse.**

**POPULATION — stated so it cannot be quietly reshaped:** rows in `closed_trades` with `closed_at > 12:05:09Z` **AND `close_reason <> 'never_filled'`** *(that cohort carries NULL provenance BY DESIGN — `B-EXIT-PROVENANCE`'s own carve-out)*.

| # | assertion | PASS | FAIL |
|---|---|---|---|
| **C1** | **OBJ-2 — the split is live.** Every post-deploy close with a non-null `exit_price_producer` | carries **one of the six `_mid`/`_last` members** | **ANY post-deploy row carrying a coarse `kraken_ws_ticker` / `kraken_equities_ws` / `kraken_rest_engine_fallback`** ⇒ a producing site was missed |
| **C2** | **OBJ-1 — the fill depth age is recorded.** Every post-deploy close with `exit_fee_mode = 'taker'` | carries a **non-null `exit_fill_depth_age_ms`** | any taker close with a NULL ⇒ either the hoist did not reach the persist, or `getDepthSnapshot` returned null and that is a SEPARATE, reportable fact |
| **C3** | **OBJ-3 — no behaviour change.** Across the window | **no new class of price-skip, no close-fill failure, and the maker/taker mix is not visibly shifted** | any of those ⇒ investigate before closing |
| **C4** | **the paired log agrees with the column** on at least one crypto close | log `ageMs` == the row's `exit_fill_depth_age_ms` | a mismatch ⇒ the column is not recording what the process saw |

⛔ **A MAKER close carrying a NULL `exit_fill_depth_age_ms` is a PASS, not a failure** — a resting fill consults no depth. **C2 is scoped to `taker` for exactly that reason.**
⛔ **AND A NULL/NULL PAIR IS NOT EVIDENCE OF ANYTHING**: `exit_fee_mode` has ONE writer, inside `closePosition`, so a close from any other path lands NULL on both. **Use `close_reason` and `closed_at` there, never the fee mode.**

## 5. ⚠️ WHAT IS UNPROVEN, STATED AS UNPROVEN
- ⛔ **BOTH OBJECTIVES ARE UNOBSERVED. n = 0 closes.** Everything in §3 is that the code SHIPPED and the app still works — **not that the columns carry correct values.**
- ⚠️ **`kraken_ws_ticker_last`'s crypto rate is UNMEASURED.** `#962`'s "0 in 373,450" is an **xStock ticker-snap** population and may not be cited for crypto. **It is consistent with the `_last` members being dead vocabulary and with them firing often.** The window will say which.
- ⚠️ **`P11`'s test has a reach of ONE of the three split members.** Only `kraken_ws_ticker_*` flows through `toCachedProducer`; the other four reach the cache via `updateCache(producer: CachedProducer)`, which never calls the switch. **They are safe by a CALL-SITE fact that no test pins, and call sites move.**
- ⚠️ **`markKindOf` is SYMMETRIC**, so confirming the argument order `(bid, ask)` at four sites has **no power** to detect an order error. It would surface only if the predicate ever became asymmetric.
- ⛔ **OUT-OF-REPO READERS ARE OUT OF INSTRUMENT REACH.** A saved dashboard query or notebook filtering `= 'kraken_ws_ticker'` now silently returns pre-epoch rows only, and **reports a confident, truncated cohort**. Nothing in the repo can see it.

## 6. ✅ FAIL-LOUD BY DESIGN — a decision, not an oversight
`exit_fill_depth_age_ms` is included in **every** `closePosition` UPDATE, so code running against a database lacking the column would **throw on every taker close**.
**Langston ruled it ships unguarded, and rejected my reasoning for it.** I argued *"the same coupling every additive column already has"* — **that is `pre-existing-therefore-fine`, the pattern he made me name at `B-MBIM-SWITCH-ON`, and I reached for it again.**
✅ **THE ACTUAL REASON: the exposure is ASYMMETRIC and only one direction exists.** Rolling the CODE back is inert — old code never names the column and a surplus column costs nothing. The only failure is **schema-behind-code**, and **with no rollback file nothing automated can produce it.** `dt-deploy` runs `db:migrate` between build and restart under `set -euo pipefail`, so a failing migrate aborts before the restart. **Throwing on a schema mismatch is the correct direction.**
⛔ **A guard would be a silent fallback on a DB-governed write, and would manufacture a FIFTH null state on the column whose whole contribution is enumerating four.**

## 7. ✅ GOVERNANCE LEDGER — **EVERY DOCUMENT CHANGED, BY NAME. COMPLETE AT CLOSE.**

**TIER 1 — unconditional, every batch:**
| document | what changed |
|---|---|
| `BATCH_CATALOG.md` | entry flipped **OPEN → CLOSED 2026-09-07**, carrying the C4 result and the reach correction |
| `PHASE_HISTORY.md` | Phase-19 entry flipped **OPEN → CLOSED**, same two facts, plus why `#961`/`#962` stay open |
| `PHASE_19_PLAN.md` | row `3b.h` status flipped to CLOSED; rows `3b.i` and three leads homed at `3b.g` |
| `B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` | **this file** — converted from the progress report, §11 (the C4 result + my reach error) and §12 (the conversion, both halves) |
| `B_EXIT_BOOK_AGE_STAMP_SCOPE.md` · `B_EXIT_BOOK_AGE_STAMP_PRE_AUDIT.md` · `B_EXIT_BOOK_AGE_STAMP_CHANGE_LIST.md` | the batch's own step documents |
| `.claude/memory/MEMORY_CC_C.md` | working-state block |
| T1 · the four session task lists | ✅ **mine** / `N/A — not mine` ×3 — ⚠️ **added 2026-09-11, late:** `CC_C_SESSION_TASK_LIST.md` did not exist at this 09-07 close (Kyle's rule landed 09-05). It is created in the same commit as this row, on the governance checker's alert `2ec36624`, routed by Langston. The other three lists are not mine to touch. |

**TIER 2 — judged applicable and updated:**
| document | what changed |
|---|---|
| `SYSTEM_IMPACT_MAP.md` | new component `2.1.2.a`; the producer SPLIT EPOCH recorded; a stale *"not instrumented"* line corrected |
| `SYSTEM_MANUAL.md` | the `translateV2ToV1` mark-price node |
| `RUNNING_ISSUES.md` | `#964` filed and placed; **`#961` and `#962` ANNOTATED AND LEFT OPEN** — measuring a defect is not fixing it |
| `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md` | a stale member count of mine, corrected |
| `MISTAKE_PATTERNS.md` | a new instance under the EXISTING slug **`absence-measured-with-the-wrong-object`** — the rotating-log reach error that made C4 look unevaluable. ★ **Filed as an instance, not a new slug: the object my claim was about was the retained log SET; the object I measured was one file in it.** |

**TIER 2 — judged NOT applicable, stated rather than skipped by default:**
`ADJUSTMENT_FRAMEWORK.md` · `AUTHORITY_BASELINE.md` · `STORAGE_POLICY.md` · `MULTI_ASSET_VTS_EXPANSION_PLAN.md` — **the batch changed no parameter-adjustment governance, no authority boundary, no retention window and no VTS expansion assumption.** ★ **It added two columns and split three producer members; it changed no behaviour, by its own OBJ-3.**

✅ **NOTHING REMAINS OWED.** *(The prior revision of this section listed `BATCH_CATALOG.md`, `PHASE_HISTORY.md` and this report's conversion as still owed. All three landed 2026-09-07.)*

## 8. CONVERSION
⛔ **This becomes `B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` only when BOTH halves are done: the data is in AND a decision or action has been taken on it.** A window that has merely elapsed does not close the batch.
**Card stays in `Observation`. The `RUNNING_ISSUES` entries stay open.**

---

## 9. ⏱ THE CRITERION FIRED 2026-09-06T12:05:09Z — EVALUATED AGAINST §4 AS WRITTEN. **THREE PASS, ONE UNEVALUABLE, AND THE BATCH DOES NOT CLOSE TODAY.**

**Alert `65a1379e-a382-43fe-960a-9e47f68e76eb` fired on schedule and is ACKED `--by cc-c`.** Population exactly as pre-registered — `closed_at > 2026-08-30T12:05:09Z` AND `close_reason <> 'never_filled'` ⇒ **39 rows.**

| # | assertion | result |
|---|---|---|
| **C1** | the split is live; ANY coarse producer ⇒ FAIL | ✅ **PASS — ZERO coarse rows.** Producers ENUMERATED, never `LIKE`: `kraken_ws_book_mid` 21 · `kraken_equities_ws_mid` 18 |
| **C2** | every `taker` close carries a non-null `exit_fill_depth_age_ms` | ✅ **PASS — 27 taker closes, 27 non-null, ZERO failures** |
| **C3** | no new close class; maker/taker mix not visibly shifted | ✅ **PASS** — taker **69.2%** post (27/39) vs **63.0%** pre (75/119); **6 pp on n=39, inside the ±7.4 pp standard error.** No new `close_reason` class post-deploy |
| **C4** | the paired log agrees with the column on ≥1 crypto close | ⛔ **UNEVALUABLE — explicitly NOT passed** |

⚠️ **C1's PASS WORDING WAS UNDER-ENUMERATED AND THE DATA EXPOSED IT.** §4 says *"carries one of the six `_mid`/`_last` members"* — **but 21 of 39 rows carry `kraken_ws_book_mid`, which is a SEVENTH, legitimate producer whose own declaration (`live-pricing-adapter.ts:71`) reads "NOT SPLIT".** ⇒ **the verdict is carried by C1's FAIL clause (no coarse forms), which is unambiguous and passes. The PASS clause was wrong when I wrote it.** Recorded rather than silently reinterpreted.

### ⛔ C4 — AND THE REASON IS AN INSTRUMENT-REACH DEFECT IN MY OWN CRITERION
**`out.log` covers 09:14:43Z → 12:15:01Z — THREE HOURS. The window is SEVEN DAYS.** All 11 qualifying crypto taker closes predate that retention, so **the paired lines have rotated away.** The query returns **0 rows**, and that zero is the instrument's reach, not evidence.
⇒ ★ **I WROTE A 7-DAY CRITERION WHOSE PROOF LIVES IN A 3-DAY SIZE-ROTATED LOG — unverifiable by construction.** I put the `out.log`-rotation warning into my own memory nine days ago for a different batch. **C4 is UNEVALUATED, not failed — a weaker and more honest verdict.**

### ⛔ V4 — CITED, NOT OBSERVED (which §4 explicitly permits)
**Zero closes carry `kraken_rest_engine_fallback_mid`/`_last`.** ✅ **CITED REASON: across 7,197 `EVAL_EXIT` cycles in the log window, `withRestPrice=0` on EVERY ONE** — the REST arm supplied none of the exit-evaluation prices, and a close's producer is stamped from that price. ⚠️ **REACH: 3 hours, not 7 days.**
⚠️ **NEAR-MISS RECORDED: I first read `REST_TICK` ×1,730 against `withRestPrice=0` as a contradiction. IT IS NOT.** `EVAL_EXIT`'s counter covers the **4 open positions evaluated for exit**; `REST_TICK` fires over a **wider price-fetch set including BTC/ETH/SOL/XRP/ADA, which we do not hold.** **Two adjacent log lines, two populations — I nearly filed my own `wrong-object` as an engine defect.**

### ⚠️ ONE OBSERVATION OUTSIDE C1-C4 — RECORDED, NOT DISPOSITIONED
**`trailing_stop_hit`: 8 pre-deploy, 0 post-deploy.** ⛔ **C3's failure condition is a NEW class; a class going quiet is not that, so this is NOT a C3 failure.** Consistent with the ratchet being off (0 break-even latches in 705 states, `break_even_enabled=false` since May). **Flagged so it is not lost; not claimed as a finding.**

### ⇒ DISPOSITION — THE WINDOW ELAPSED, SO THIS IS A RESULT, NOT A DELAY
**`workflow-10`: an observation that does not meet its criterion converts to a completion report recording the outcome, or reopens at the step needing redoing. It never quietly waits.**
⇒ **C4 needs ONE live pairing on the NEXT crypto taker close — minutes-to-hours of watching, not another 7-day window.** Proportionate to the single missing cell, and the only thing between this batch and its close. ⛔ **The bar is NOT lowered and C4 is NOT waived.**

---

## 10. ⏳ C4 DEFERRED TO A SELF-FIRING ALERT — **NOT WAIVED. AND THE CLOSURE DECISION IS LANGSTON'S, NOT MINE.**

**A 3.3-hour live watch (2026-09-06, 40 polls) caught NO qualifying crypto taker close.** ✅ **That is the EXPECTED result, not a failure: 11 crypto taker closes in 7 days ≈ 1.5/day, so a 3.3-hour window catching zero is what the rate predicts.** ⛔ **Reported rather than silently re-armed.**

✅ **ARMED: alert `6cbef7d0-8067-4085-ab8c-8cc4c1fe19e5`, category `verification`, fires `2026-09-07T13:00:00Z`, dedupe-key `b-exit-book-age-stamp-c4`.** ★ **Its body carries C4 VERBATIM plus the discharge procedure, everything that already passed, and the known defect in C1's PASS wording — so whoever picks it up needs neither this file nor this conversation.** It also carries the two instrument traps that bit me today: **check `out.log`'s reach FIRST and state it**, and **read `error.log` too, because warn/error lines never reach `out.log` and a one-file grep manufactures a zero.**

### ⛔ WHETHER THIS BATCH MAY CLOSE IS A RULING I AM NOT MAKING
**The case FOR closing:** `workflow-10`'s alert-gated composition explicitly permits it — *"a batch may close with a genuinely deferred item PROVIDED the alert carries the criterion and the result is written back when it fires"* — with `P19-B8.5l` (fence deferred to a named alert) and `B-MBIM-SWITCH-ON` (retention flip still armed) as ratified precedents. C1-C3 pass, V1-V3 are observed, V4 is cited, and the deferred item is carried by a self-firing alert that cannot quietly elapse.
**The case AGAINST:** **C4 is the only assertion that checks the column's VALUE rather than its PRESENCE.** C2 proves 27/27 rows are populated; **C4 is what would catch a populated column recording the wrong number.** Closing with it unverified means closing with the one correctness check outstanding.
⇒ ⛔ **PUT TO LANGSTON. I have over-claimed repeatedly today and the disciplined move is to state both cases and let the reviewer rule** — not to grade my own batch's exit on the reading that finishes it.

**Until he rules: card stays in `Observation`, the `RUNNING_ISSUES` entries stay open, and §8's conversion condition is unmet.**

---

## 11. ✅ **C4 PASSES — AND THE REACH FIGURE THAT MADE IT LOOK UNEVALUABLE WAS MINE AND WAS WRONG.** *(2026-09-07)*

⛔⛔ **THE CORRECTION FIRST, BECAUSE IT IS THE MORE USEFUL HALF: §9's V4 and §10 both state the log's reach as *"3 hours."* THAT IS WRONG. THE RETAINED REACH IS ~18 HOURS.**
**`pm2-logrotate` is configured `max_size 1G, retain 14`. `retain` IS A FILE COUNT, NOT A DURATION.** The live `out.log` rotates every ~1-1.5h, and **fourteen rotated archives sit on disk beside it.** I measured the live file, called that the instrument's reach, and concluded the evidence had aged out. ⇒ **I declared a criterion unevaluable because I never opened the archives.**
★ **This is the `#661` leg-2 window-coverage class, and it failed in the direction that makes a real answer look unavailable** — the most expensive direction, because nobody re-checks an absence. **Cost: one re-armed alert and a 3.3-hour live stakeout for something already sitting on disk.** *(`MISTAKE: instrument-reach [B-EXIT-BOOK-AGE-STAMP]`.)*

### ✅ THE PAIRINGS — LANGSTON FOUND TWO; I RE-DERIVED ONE MYSELF AND THE OTHER HAS SINCE ROTATED OUT
⛔ **STATED PRECISELY RATHER THAN ROUNDED UP, because the retained window is ROLLING and this record outlives it.**

| # | pairing | printed | recorded | verdict | who |
|---|---|---|---|---|---|
| **1** | **`JUP/USD`** `2026-09-07 03:50:18` | log `ageMs=40` | row `2ca0d245-…`, `closed_at 2026-09-07 03:50:18.451+00`, `kraken_ws_book_mid`, `exit_fill_depth_age_ms::text = '40'` | ✅ **EXACT**, `= 40 → t` | **Langston, then RE-DERIVED BY ME at the object** |
| **2** | **`KTA/USD`** `2026-09-06 19:15:14` | log `ageMs=21` | row `closed_at 2026-09-06 19:15:14.581+00`, taker, `::text = '21'` | ✅ **EXACT**, `= 21 → t` | **Langston only — AGED OUT of retention before my read** |

⚠️ **PAIRING 2 IS RULED ON REPORTED FACT AND IS LABELLED AS SUCH.** At my read the oldest retained archive began `2026-09-06 20:39:44`; the KTA line at `19:15:14` had rotated out in the ~1h between his read and mine. **I am not claiming to have reproduced it. C4 stands on pairing 1, which I verified end-to-end myself; pairing 2 corroborates.**
✅ **POSITIVE CONTROL, and it discriminates:** `grep FILL_DEPTH_AGE` across live + all 14 archives returns **exactly 1** — the instrument fires, and the population within current reach is one row, not zero. **A silent grep would have been indistinguishable from a broken one.**
✅ **COMPARED AT FULL PRECISION** — `::text` **plus** an equality predicate, never psql's display rounding. **The column is `doublePrecision`; a rounded display against an integer log value is exactly the near-match trap C4 was written to catch.**
**Post-deploy qualifying population re-measured: 32 closes carry a non-null `exit_fill_depth_age_ms` since 2026-08-31, latest the JUP row itself.**

⇒ ✅ **C4 = PASS.** The recorded number is the printed number, exactly, on the trade it was recorded for.

---

## 12. 🟩 **CONVERSION — THE DATA IS IN AND THE DECISION IS TAKEN**

**§4's criterion, quoted as written, against the outcome:**
| cell | criterion | outcome |
|---|---|---|
| **C1** | no coarse producer on a post-deploy close | ✅ PASS *(on the FAIL clause; the PASS wording was under-enumerated — see §9)* |
| **C2** | every qualifying taker close carries the depth age | ✅ PASS — 27/27 |
| **C3** | no new exit class appears | ✅ PASS — mix 69.2 vs 63.0 on n=39, inside SE |
| **C4** | the recorded age equals the printed age | ✅ **PASS — `JUP/USD` 40 = 40 (re-derived by me), `KTA/USD` 21 = 21 (Langston)** |

**THE DECISION, AND WHO TOOK IT: LANGSTON RULED C4 A PASS AND DIRECTED THE CONVERSION** *(2026-09-07T13:12Z, verified at the graded ref on his own commands — explicitly not reported fact)*. **§10 put the closure ruling to him precisely because I should not grade my own batch's exit, and this is that ruling.**
⇒ **BATCH CLOSED.** Card moves `Observation` → `Complete`. Alert `6cbef7d0-…` resolved **only now the result is recorded** — a resolved row on an undocumented result is a silenced obligation.

### ⚠️ WHAT REMAINS UNPROVEN, STATED AS SUCH
- **`trailing_stop_hit` 8 → 0** is recorded in §9 and is **not** a C3 failure; it still has **no home**. ⇒ **DISPOSITION: own batch — folded into `B-RATCHET-RE-ASK`**, since the ratchet being off is the standing hypothesis and Kyle's own reason for disabling it has expired (VTS-era reasoning applied to a paper-trading system).
- **V4 stays CITED, not observed** — and its reach figure is now correctly stated as ~18h, which does not change its status.

