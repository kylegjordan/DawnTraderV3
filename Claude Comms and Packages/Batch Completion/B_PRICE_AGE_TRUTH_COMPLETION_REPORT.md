# B-PRICE-AGE-TRUTH — COMPLETION REPORT (converted from the progress report, 2026-09-11)

# ✅ CLOSING — THE WINDOW ENDED AT THE OBJ-7 DEPLOY WITH THE ARM EMPTY; CONVERTED ON LANGSTON'S APPROVAL; STEP 11 AWAITS HIS CONFIRMATION

**Batch:** `B-PRICE-AGE-TRUTH` · **Issue:** `#951` · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class:** architecture · **Card:** `Observation`, to `Complete` at Langston's Step-11 confirmation
**Deployed:** `2af2e0bacc1430a6452559b83ba7d3be15adc7be` @ **2026-08-31T11:30:47Z** (`dt-deploy --by CC-C`, engine resumed, identity asserted, migration 715 ms)

> **Why a PROGRESS report and not a completion report:** the work shipped and is verified in the runtime, but **the confirming artifact — the new producer token on a closed trade — requires a close to occur, and there have been ZERO post-deploy closes against 3 open positions.** Per `workflow-10`, a batch whose evidence needs a window gets this document, and it is **CONVERTED** into the completion report when the data is in **AND a decision has been taken on it** — not when the window merely elapses.

---

## 0. ✅ THE CLOSE — THE DATA, THE DECISION, THE OBJECTIVES

**OPEN ITEMS, STATED FIRST, EACH WITH ITS HOME:**
1. **OBJ-2 (the `source` label and its actionability consequence): CARVED OUT at Step 2** to `B-PRICE-AGE-REFUSAL` (plan row `3b.f-b`), which was absorbed into `3n` `B-PRICE-SIDE-BY-JOB` r5 on 2026-09-11 as decision D7 (`Scope Files/PRICING_DECISIONS_2026-09-11.md`).
2. **OBJ-3 (the census of price-substitution sites): WITHDRAWN, NOT DISCHARGED at Step 2.** The remainder is `#976` `B-PROVENANCE-LOSS-CENSUS`, plan row `3b.m` (`Scope Files/B_PRICE_AGE_TRUTH_PRE_AUDIT.md:515`, `:532`).
3. **The stored-row tripwire** that replaces the retired `closed_trades` leg: `3n` scope row `8g-bis` (`Scope Files/B_PRICE_SIDE_BY_JOB_SCOPE.md`), written 2026-09-11 at `6f6b8be3d`.
4. **§5 item 1 stays unproven:** that the honest stamp ever reaches `closed_trades`. This close records that the retired instrument cannot prove it.
5. **§5 item 2 stays unmeasured:** xStock exits take a path this batch did not touch (`active-execution-engine.ts:1545` at head).

### (a) WHAT DATA CAME IN — against the criterion as pre-registered (§4)
**The criterion, quoted:** *"PASS — all three must hold over the window: 1. Every row whose `exit_price_producer` is `kraken_rest_poller` or `kraken_rest_rate_limited_reserve` carries a NON-NULL `exit_observed_at_ms`. 2. Every row stamped `kraken_rest_rate_limited_reserve` carries an `exit_observed_at_ms` strictly older than its own close instant by ≥ 1 s. 3. No row carries `kraken_rest_rate_limited_reserve` together with an `exit_price_source` other than `kraken_rest`."* *"NEITHER PASS NOR FAIL: the ABSENCE of any `kraken_rest_rate_limited_reserve` row ... In that case the window EXTENDS; it does not pass."* And the stopping rule added with the successor gate on 2026-09-10 (§9a): at the fire, an empty arm is the result, and the batch converts, recording a re-scope onto an exercised path or the assertion's retirement.
**The outcome:** the touched arm was empty at every read: 44 closes (2026-09-07), 66 (2026-09-09) and 82 (2026-09-11 19:52Z, the terminal read at the pre-deploy build `a5273ad6d`), by an exhaustive producer census (`kraken_ws_book_mid` 53, `kraken_equities_ws_mid` 25, no producer 4, all four `never_filled` with no exit read). Zero reserve rows, so **neither PASS nor FAIL** on the pre-registered rule. The second window could not run to its 2026-09-16 fire as one population: `3n` OBJ-7 deployed at `2026-09-11T20:09:47Z` and changes the exit leg's REST budget (P-7h), the arm the criterion depends on. **Reads are not fires: the gate had never fired, and the disposition was taken early on the deploy boundary** (§9b).

### (b) WHAT DECISION WAS TAKEN, AND BY WHOM
**Decided by CC-C; approved by Langston** (2026-09-11 20:17Z in substance with one correction and four conditions; 20:33Z APPROVED, `Review = Approved` on the card):
- **PASS 2 RE-SCOPED onto the adapter's runtime re-serve, which is exercised:** 10,682 re-serves (13:11-19:43Z) with 0 dropped in the parse census, and an honest carry in the distinct-stamp measure (about 385 stamps over about 1,185 re-serves on each of the five symbols with no WebSocket cache writes, against RAY/USD's 1,141 over 1,192); re-measured after the OBJ-7 restart (191 re-serves, the same shape).
- **PASS 1 and PASS 3 discharged by construction:** `live-pricing-adapter.ts:265` (a non-nullable stamp), `:816-818` (a reserve result only on a finite stamp), `:668` (the `kraken_rest` source literal); the reserve producer is constructed at exactly one site, `:817` (Langston's whole-tree census).
- **The `closed_trades` leg RETIRED with a stored-row tripwire**, homed at `3n` row `8g-bis`.
- **Gate `0db25f1d-3da5-46e2-9303-09290eb447b5` resolved, not acked**, with `337e2f901`; Langston's two follow-up conditions (the tripwire written into the scope row; the `BATCH_CATALOG.md` cite corrected) landed at `6f6b8be3d`.

### OBJECTIVES (scope §4)
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | the rate-limited branch stops discarding age | **YES** | P1 shipped; the Step-7 runtime control in §3 (the WebSocket-fed `ZEC/USD` median −0.5 s against the REST-only median 29.3 s, n=975) and the distinct-stamp measure in §9b |
| OBJ-2 | the labels tell the truth; actionability measured before it ships | **NO — carved out** | P2 and P8 to `B-PRICE-AGE-REFUSAL` (`B_PRICE_AGE_TRUTH_PRE_AUDIT.md:514`), now `3n` D7; the producer token (P3) shipped here |
| OBJ-3 | a census of price-substitution sites | **NO — withdrawn** | the one-site claim withdrawn after a claim-only reader found six evading mechanisms (`B_PRICE_AGE_TRUTH_PRE_AUDIT.md:532`); the remainder is `#976`, row `3b.m` |
| OBJ-4 | the persisted poison addressed | **YES** | P5, re-serve monotonicity, with the falsifier replaced (scope §7.3; pre-audit `:16`, `:141`); at runtime a re-serve does not advance the stamp (§9b distinct-stamp counts) |
| OBJ-5 | `#743` not folded in, the boundary written down | **YES** | scope §5; `#743` stays at plan row 6 |

**CI:** run `33385072558` on the deployed head `2af2e0bac`, per job: TypeScript Check (baseline gate) success, Test Suite success, Build success, Docker Build success.

### GOVERNANCE FILES CHANGED
**At deploy (2026-08-31):** the tier ledger in §7, transcribed at the time and unchanged here.
**At close (2026-09-11):**

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | status to closing, with the outcome; the `aee:1289-1300` cite corrected to `:1635-1642` (`6f6b8be3d`) |
| T1 | `PHASE_HISTORY.md` | ✅ | status to closing, with the outcome |
| T1 | `PHASE_19_PLAN.md` | ✅ | row `3b.f` status to closing |
| T1 | own `MEMORY_CC_C.md` and its mirror | ✅ | position updated |
| T1 | `Scope Files/CC_C_SESSION_TASK_LIST.md` | ✅ | row `3b.f` to closing |
| T1 | the batch `SCOPE` | N/A | unchanged; its objectives are graded above |
| T1 | this `COMPLETION_REPORT` | ✅ | converted from the progress report, not rewritten |
| T1 | Langston's `/home/langston/MEMORY.md` | handed to Langston | since `B-LANGSTON-CONTEXT` (2026-09-11) it is written through `langston-memory-write`; the Step-11 dispatch asks him to update his `#951` line |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#951` closing amendment |
| T2 | `Scope Files/B_PRICE_SIDE_BY_JOB_SCOPE.md` | ✅ | row `8g-bis`, the stored-row tripwire (`6f6b8be3d`) |
| T2 | `SYSTEM_IMPACT_MAP.md` | N/A | the producer vocabulary's second epoch (`:342`) still holds; the close changes a verification criterion, not a component |
| T2 | `SYSTEM_MANUAL.md` | N/A | the producer stays provenance, not consulted by the actionable gate (`:4774`); no architecture or maths changed at close |
| T2 | `CHANGES_AND_FIXES.md` | N/A | `FIX-2026-08-31-A` stands; nothing new was fixed at close |
| T2 | `MISTAKE_PATTERNS.md` | N/A | the one instance at close (reads counted as fires) carries a `MISTAKE:` trailer on the conversion commit, which the weekly pass reads |
| T2 | `POST_AUDIT_ROADMAP.md`, `ADJUSTMENT_FRAMEWORK.md`, `AUTHORITY_BASELINE.md`, `STORAGE_POLICY.md`, `MULTI_ASSET_VTS_EXPANSION_PLAN.md`, `ASSET_CLASS_ONBOARDING_WORKFLOW.md`, `BUILD_METHOD_PLAYBOOK.md`, `LANGSTON_ARCHITECTURE.md`, `CLAUDE.md` / `CONDUCT.md`, `_archive/CLAUDE_MD_RULE_HISTORY.md`, `DELETED_COMPONENTS_LOG.md`, `GOVERNANCE_EXCEPTIONS.md`, `ALERT_HANDLING_PROTOCOL.md`, `DELIVERY_BOARD_PROTOCOL.md`, `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the reasons in §7 still apply: the close adds no roadmap change, parameter, authority boundary, retention change, onboarding learning, method change, reviewer change, rule, code deletion, exception, alert-process change, board change or feature check |

**HONEST RESIDUAL:** this batch proved that the adapter carries a re-serve's original age and labels it with its own producer. It did not prove that the honest stamp reaches a stored exit row, because no exit took that path in 82 closes. The stored-row tripwire at `8g-bis` is where that proof, or its failure, will first appear.

---

## 1. WHAT THE BATCH IS FOR

When our own REST rate limiter declines to ask Kraken for a price, the code re-serves the stored price. It returned it as a **bare number**, so the caller could not tell a re-serve from a genuine venue read and stamped **`observedAt: Date.now()`** and **`producer: 'kraken_rest_poller'`** on both. **A price of any age was recorded as *observed now*, under the same producer a real venue read gets.**

⇒ **the planned 15-second freshness guard would have read the fabricated stamp, seen "fresh", and never fired.** That is why this precedes the guard.

⛔ **THIS IS NOT A NEW PROVENANCE BATCH AND IT STORES NOTHING NEW.** No schema change, no migration. `exit/entry_price_producer` and `exit/entry_observed_at_ms` were created by `B-EXIT-PROVENANCE` on 2026-08-26. **This batch changes only the VALUES written into them.**

## 2. WHAT SHIPPED

| | |
|---|---|
| **P1** | `fetchFromKrakenRest` returns a shaped result carrying the **ORIGINAL** `observedAt` |
| **P3** | a fifth producer token, **`kraken_rest_rate_limited_reserve`**, in `toCachedProducer`'s passthrough arm |
| **P5/P7/P9** | re-serve monotonicity · comment truth · both `getAllPrices` read sites re-read in full (neither branches on `producer`, `observedAt` or `source`) |
| **carved out** | **P2/P4/P6/P8 → `B-PRICE-AGE-REFUSAL`** (row 3b.f-b, gated on `#971`) |

⛔⛔ **THE SAFETY PROPERTY: `source` IS UNCHANGED**, so the re-serve stays actionable exactly as before. Relabelling would fail the gate at `aee:1277` and route the blocked population onto the engine's **un-rate-limited** leg (`aee:1289-1300` → `exchanges/kraken/kraken.ts:259` → `makePublicRequest :177-194`, whose body is `checkMaintenanceMode()` and a bare `fetch`).
★ **Langston strengthened this beyond my claim:** `getPriceWithFallback` computes its freshness window off **`cachedAt`, never `observedAt`** (`:1170`, both arms `:1176`/`:1186`) ⇒ **pinning the age cannot flip which leg the engine takes.** Every consumer of `observedAt` outside the adapter is a recorded provenance field — **zero gates, zero age arithmetic.**

## 3. STEPS COMPLETED, WITH EVIDENCE

| step | evidence |
|---|---|
| 1-2 scope + audit | **APPROVED** — scope w/ 7 conditions, plan w/ 4, all applied |
| 3 implementation | **THREE reader rounds, each broke the previous round's fix** — see §6 |
| 4 code review | **APPROVED at `4e8dbf288`**, 3 conditions, all applied at `0d2e22b47` |
| 5 CI | **4/4 green** on the deployed head — TypeScript Check, Test Suite, Build, Docker Build |
| 6 deploy | `2af2e0bac` @ `11:30:47Z`; **tsc 384 = 384 baseline**; four adapter suites **45/45** |
| 7 first-pass verify | runtime measurement below; **UI navigated** (Claude-in-Chrome, no login) — dashboard + trades render, live prices, no new errors |
| 8 Langston verify | **CONFIRMED WITH CORRECTIONS.** Deploy independently verified; population re-derived; two of my statistics refuted |

★ **MEASURED IN THE RUNTIME, n=975 post-deploy re-serves — AND THE SHAPE IS THE FINDING, NOT A RATE.** A **deterministic 4-rung sawtooth: 14.3 / 29.3 / 44.3 / 59.3 s** (genuine observations land every 60 s, the serve fires every 15 s).

| cohort | n | min | median | max |
|---|---|---|---|---|
| `ZEC/USD` — the one WS-fed symbol | 164 | −0.9 s | **−0.5 s** | 0.7 s |
| five REST-only symbols | 811 | 13.3 s | **29.3 s** | **59.3 s** |

⛔ **A single median across these is a MIXTURE AVERAGE and was refuted as a headline.** **Every one of these was previously recorded as 0 s.**
**Negatives dispositioned:** n=142, all strictly inside (−1, 0), min −0.941 — **that bound IS the prediction** of the second-granularity-log-stamp mechanism, so it is a test and not a restatement. **The honest reported value is "under 1 second"; a negative should never have been printed as a distribution endpoint.**

---

## 4. ⛔⛔ PRE-REGISTERED CLOSE CRITERION — WRITTEN BEFORE THE DATA EXISTS. DO NOT DATA-MINE.

> **Form supplied by Langston at Step 8 and adopted verbatim, because a bare null is UNFALSIFIABLE here:** `observedAtMs` has **three** assignment arms — `aee:1244` xStock (`_eqTick.tsMs`), `:1285` crypto WS-adapter (`priceResult.observedAt` — **the only arm this batch touches**), `:1324` crypto direct-REST fallback (**`null` by design**). **Two of three arms produce a result this batch did not touch, which makes `null` compatible with BOTH success and failure.** ⇒ **the age must be read JOINTLY WITH `producer`.**

**WINDOW:** the first of — **20 post-deploy closes**, or **7 days** (fires **2026-09-07**). Population: `closed_trades` where `closed_at >= 2026-08-31T11:30:47Z`.

**PASS** — all three must hold over the window:
1. **Every** row whose `exit_price_producer` is `kraken_rest_poller` **or** `kraken_rest_rate_limited_reserve` carries a **NON-NULL** `exit_observed_at_ms`.
2. **Every** row stamped `kraken_rest_rate_limited_reserve` carries an `exit_observed_at_ms` **strictly older than its own close instant by ≥ 1 s** — i.e. it is not a re-stamp wearing a new name.
3. No row carries `kraken_rest_rate_limited_reserve` together with an `exit_price_source` other than `kraken_rest` (the unchanged-`source` safety property, asserted on stored data).

**FAIL** — any one of:
1. A row on the touched arm with a **NULL** `exit_observed_at_ms`.
2. A `kraken_rest_rate_limited_reserve` row whose `exit_observed_at_ms` equals its close instant (**laundering persists**).
3. `exit_price_source` changed on a re-serve row (**the carve-out leaked**).

⛔⛔ **NEITHER PASS NOR FAIL — AND THIS IS THE TRAP THE CRITERION EXISTS TO AVOID: the ABSENCE of any `kraken_rest_rate_limited_reserve` row.** That means the window did not exercise the path, **not** that the batch works. ★ **A silent instrument with zero opportunity is not evidence** (`#661` leg 3). In that case the window **EXTENDS**; it does not pass.
⛔ **AND: `LIKE 'kraken_rest%'` IS FORBIDDEN on this column — the new member shares the prefix, so a `LIKE` cohort silently gains members. ENUMERATE.**
⚠️ **xStock rows are OUT OF POPULATION for criteria 1-3** — they take `:1244`, untouched by this batch. Recording them is informative, never pass/fail evidence.
➕ **THE INFORMATIVE xSTOCK READ, PRE-REGISTERED 2026-09-02 (Langston disposition, §13 fold-in) — AND THE ALERT ROWS SIT IN TWO REGIMES, SO THEY MAY NOT BE COUNTED.** The boundary this window is expected to show is Langston's own: *"crypto exits are fed, xStock exits are unknown."* Its instrument is the `Exit checks skipped — mark older than ceiling` alert on xStock names (xStock equity-tick arm, σ-derived per-symbol ceilings, pre-open US). ⛔ **On 2026-09-02 at ~09:42Z CC-C RESOLVED two of those rows (PANW/USD `3584c3ba`, MDT/USD `66e6350c`) with position-row evidence a few minutes before Langston's routing said leave them ACTIVE — and the dedupe mechanism (`server/services/system-alerts.ts:384-395`, read at branch tip by Langston: suppression is on `state !== 'resolved'`; resolved is terminal and does NOT block a fresh alert) means those two symbols now MINT A NEW ROW PER RECURRENCE for the rest of the window, while every symbol left ACTIVE is deduped to EXACTLY ONE ROW however many times it skips.** A per-symbol count of fired rows would therefore read two regimes and over-weight the two resolved names. **PRE-REGISTERED READ — NOT A COUNT:** (b) **presence / absence per symbol in-window** — both regimes answer that identically, and it is the ONLY regime-invariant read. ⛔ **The `streak` (consecutive skipped ticks) in the alert body does NOT neutralise the regimes — it inherits them (Langston's own correction, 2026-09-02, re-verified at `98f40eda1`):** the body is written at mint (`active-execution-engine.ts:181`) and the dedupe path returns the existing row without rewriting it — `recordResurface` (`system-alerts.ts:600-616`) bumps `resurface_count`/`last_resurfaced_at` ONLY — so for a symbol left ACTIVE the body's streak is FROZEN AT FIRST FIRE, while for the two resolved symbols the max across their minted rows is a genuine window max. ⇒ **The streak is admissible only as a PER-REGIME-LABELLED FLOOR: for ACTIVE symbols report it as *streak at first fire*; for PANW/MDT as *max over minted rows*; NEVER compare the two numbers against each other.** A true window max on ACTIVE symbols has NO instrument at this retention (the log holds hours, the window seven days) — stated, not claimed, same as (a). ⛔ The application log cannot serve as the per-tick emitter over a 7-day window (it retains ~hours), so (a) *count the underlying skip events off the emitter's telemetry* is NOT available for this window and is not claimed. **`#977`'s unsubscribed 2-second refresh bucket as the MECHANISM is a HYPOTHESIS, unmeasured on these positions.** Forward rule inside this window (CC-C memory, 2026-09-02): xStock exit-skip alerts are exposure-checked and LEFT ACTIVE — the asymmetry above is frozen at two symbols, not removed, and the record says so.
➕ **MDT/USD `b1f58a01` (fired 10:14:54Z, 40 consecutive skips, mark 124 s vs ceiling 65 s) — READ 2026-09-02 12:17Z on Langston's routing, row LEFT ACTIVE: the ceiling WORKING on a thin pre-open cadence, NOT a feed gap.** Instrument: `xstock_spot_ticker_snap` for `MDT/USD` (the 4 s-throttled, value-blind archive — a SAMPLE, so cadence here is a floor on venue cadence, never the engine's mark rate). Population: rows by capture hour, 2026-09-02 UTC — 06Z 95 · 07Z 129 · 08Z 106 · **09Z 15 · 10Z 21 · 11Z 48** · 12Z 13 (partial); 6,945 rows in the trailing 24 h, 79 in the trailing 2 h, 13 in the trailing 15 min, last row 86 s old at 12:17:32Z. ⇒ the fire sits in the hours where prints arrive every 3-4 min, so a 65 s σ-derived ceiling is exceeded BY CADENCE while the socket delivers throughout — presence, not absence, for this symbol. **Exposure at the read (position row + last book):** long, `stop_loss` 90.66, `current_price` 91.55; last book 12:16:06Z bid 90.85 / ask 92.25 (1.5% wide), the bid 0.2% above the stop — the engine's exit read is the mid, so a stop-side bid touch is unpriced until the mark refreshes inside the ceiling. Recorded against the 09-07 criterion as one presence row, not a count (dedupe regime: ACTIVE — first-fire streak only).
➕ **NEM/USD `6339b2d9` (fired 2026-09-02 20:45:29Z, 40 consecutive skips, mark 157 s vs ceiling 98 s) — READ 20:46Z, row LEFT ACTIVE: the ceiling working on after-hours cadence (17 rows in the trailing 15 min, last row 10 s old at the read; book 124.99 / 125.20 = 0.17% wide, healthy).** Exposure at the read: long, `stop_loss` 122.18, `current_price` 125.10 — 2.3% above the stop, a tight two-sided book; no collapsed side. Presence row; the same session-blind-ceiling class as MDT (plan row 3b.f-c, owner CC-C).
➕ **THREE POST-DEPLOY xSTOCK CLOSES READ 2026-09-03 01:2xZ (Langston's ask at the B-XSTOCK-FEED-SANITY Step-4 gate): PNC / CTVA / MDT, all `stop_hit` at 00:15:01–02Z on the 8:15 PM ET handoff. `exit_price_producer = kraken_equities_ws_mid` on all three (the xStock arm, `aee:1244` — UNTOUCHED by this batch's change, which is the crypto WS arm `:1285` only); `exit_observed_at_ms` = 00:15:00.688 / 00:15:00.700 / 00:15:00.700 — 1.0 to 2.2 s before each close, honest venue stamps; `exit_tick_cadence_ms` 1,519 / 2,033 / 2,457. ⛔ THE MARKS WERE NOT STALE — they were fresh and WRONG (hollow-book mids at the handoff), which is `#943`/`#567`'s subject and is recorded in `B_XSTOCK_FEED_SANITY_PROGRESS_REPORT.md` §4b; they do NOT close `#951`. Reserve rows: the `kraken_rest_rate_limited_reserve` token is a crypto-REST arm and cannot appear on an xStock row, so "zero reserve rows" here is STRUCTURAL, not evidence — this batch's own reading for the crypto arm is unchanged: ZERO reserve rows = EXTEND, never pass/fail. Producers ENUMERATED, not `LIKE`d.**
➕ **CTVA/USD `1ea0a78f` (fired 2026-09-02 22:00:35Z, 40 consecutive skips, mark 168 s vs ceiling 88 s) — READ 22:04Z, row LEFT ACTIVE: the ceiling working on after-hours cadence (7 rows in the trailing 15 min, ~2 min apart; book 89.57 / 90.97 = 1.55% wide, two-sided).** Exposure at the read: long, `stop_loss` 87.18, `current_price` 90.27 — 3.4% above the stop, the bid 2.7% above it. Fourth instance of the class (MDT, RIOT fill-side, NEM, CTVA); presence row only.

---

## 5. WHAT IS UNPROVEN, STATED AS UNPROVEN

1. ⛔ **That the token ever reaches `closed_trades`.** Zero closes so far. **This is the whole reason the batch is open.**
2. ⛔⛔ **xSTOCK IS UNMEASURED. Langston's boundary, verbatim: *"crypto exits are fed, xStock exits are unknown."*** `BE/USD` and `PLTR/USD` are open and take `:1244` — a path this batch does not touch. **The measurement window was a Sunday with xStocks closed**, so it is **not** the "representative OPEN-MARKET window" plan row 3b.f asked for.
3. ⚠️ **WS coverage of open positions is REAL BUT CONDITIONAL.** It survives a reconnect only via `i8cResubscribeAllOpenPositions()`, which is **un-awaited** with a swallowing `catch` (`kraken-websocket-adapter.ts:2743`) ⇒ **30 s worst-case repair window** (`:2778-2827`); `softResubscribeAll:3467` clears `orderBooks`. **"Substantially covered", never "covered".**
4. ⚠️ **Causal direction of the WS/position correlation is CORRELATION ON n=1 SYMBOL.** `ZEC/USD` is both the only WS-fed symbol and the only open crypto position. **The hypothesis to test, not a finding.**
5. ⚠️ **Entry-side provenance is currently UNINSPECTABLE:** `entry_price_producer` / `entry_observed_at_ms` exist on **`closed_trades` only** — there is no such column on `active_open_positions`, so entry provenance is not persisted at open and cannot be checked until a close exists.
6. **RESIDUAL, ruled ACCEPTABLE by Langston, not closed:** three mutations still pass the fence green — they key on dimensions the single fixture pins (`'cooldown'` blocked-reason, `trackedSymbols` membership, `cached.source`). **All three ARE the carved-out refusal behaviour, which has its own batch and its own review.** ⛔ **BINDING FORWARD: `B-PRICE-AGE-REFUSAL`'s fence must be behavioural ACROSS the blocked-reason arms.**

**WHAT WOULD FALSIFY THE BATCH'S CENTRAL CLAIM:** a post-deploy closed row stamped `kraken_rest_rate_limited_reserve` whose `exit_observed_at_ms` equals its close instant. That is the laundering, surviving the fix, observable in one row.

---

## 6. PROCESS RECORD — THE PART WORTH KEEPING

**Three reader rounds, and each broke the previous round's fix.** (r1) a regression I introduced — the null test moved from the **price** to the **row**; and a "falsifier" that sliced a **type declaration** and could not fail. (r2) four evasions of the replacement fence, all green. (r3) **the fences asserted ONE HOP SHORT of the engine**: the engine reads via `getPriceWithFallback`, fed by cache rows written at **`:538`** (`observedAt: quote.observedAt ?? Date.now()`, the **sole** occurrence of `quote.observedAt` in the repo) — **unfenced, and a one-token edit re-laundered everything with 2,851 tests green.** Now fenced end-to-end and mutation-proved.

⚠️ **FOUR `wrong-object` INSTANCES, ALL OF THEM IN MY CORRECTIONS RATHER THAN THE ORIGINAL CODE:**
1. A guard justified by naming a consumer that **cannot receive the value** (`isPriceVenueQuiet` is never fed `observedAt`) — caught by Langston. Right arithmetic, wrong reachability.
2. A test anchor chosen by reading the **raw** file while the test operates on a **comment-stripped** copy.
3. Explaining the near-zero ages as "first re-serves" — an inferred mechanism, never traced. It was the WS feed.
4. Replacing that with "the mini-book is scoped to open positions" — **also wrong**; what is open-positions-only is the **reconnect** path. Same number, different meaning.

★ **THE LESSON, and it is the batch's own thesis landing on its author: THE NUMBER WAS NEVER WRONG; THE STORY ABOUT THE NUMBER WAS.** The discriminator that finally worked was **tracing ONE symbol end-to-end instead of reading an aggregate.**

---

## 7. THE TIER LEDGER — POSTED WHOLE, INCLUDING THE `N/A` ROWS

**CHANGE-CLASS: `architecture`** (as declared in the scope header; the governance checker grades against it).

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | New OPEN entry: the defect, what shipped, the sawtooth, and why it cannot close. |
| T1 | `PHASE_HISTORY.md` | ✅ | Phase-19 entry recording the batch as open on an observation window. |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row 3b.f status + its deliverable (2) answered; new row **3b.f-a** created for `#977`. |
| T1 | shared `MEMORY.md` + own `MEMORY_CC_C.md` | ✅ | Own file and its mirror rewritten to the current position; shared file unchanged because nothing here alters a cross-session consensus truth. |
| T1 | the batch `SCOPE` | ✅ | Written at Step 1 with the `change-class: architecture` header; approved with seven conditions. |
| T1 | the batch `PRE_AUDIT` | ✅ | Written at Step 2; approved with four conditions, all applied. |
| T1 | the `COMPLETION_REPORT` | ✅ | A **PROGRESS** report stands in its place — this document — and converts at close. |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | Synced with the open state, the armed alert and the joint-read criterion. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | The *"no producer is consulted by any gate"* absolute withdrawn at `:4671`. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Second epoch on `exit_price_producer` recorded with its instant; the *"`kraken_rest_poller` is UNCHANGED"* line corrected. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#951` amendment; `#977` opened, placed, then amended against my own severity claim. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-08-31-A` registered, carrying the unmeasured-xStock and conditional-WS risks. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change — the new batch was placed in `PHASE_19_PLAN.md` at row 3b.f-a instead. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No parameter, threshold or adjustment rule appears in this batch's diff. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No authority or risk-envelope boundary is touched; the diff is one service file and one test file. |
| T2 | `STORAGE_POLICY.md` | N/A | No retention window, tier boundary or capture cadence changed — no migration in this batch. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Dated WORKING-LIST review: no status changes because the diff is the crypto REST path only; the unmeasured xStock arm carried forward as an observation. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No onboarding learning surfaced — the crypto/xStock asymmetry is a measurement gap recorded on `#951`, not a playbook step. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, gate or tool changed; the method lesson went to `MISTAKE_PATTERNS.md` where it belongs. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | His model, runtime, invocation, read path and auth are all unchanged by this batch. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed; neither file appears in this batch's diff. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | It follows a `CLAUDE.md` rule add or change, and there was none. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | Nothing was removed — the change is additive on `live-pricing-adapter.ts`. |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | Four `wrong-object` instances appended, all four sitting in my corrections rather than the original code. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | No exception to a governed rule was granted by Kyle in this batch. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | The ack/resolve process is unchanged — an alert was armed, the protocol was not edited. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | No column, field or ownership change; cards moved within the existing scheme. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model/feature check did not run as part of this batch. |

**SPAWNED-READER RECORD:** `REVIEWER r1: object · implementation · HIT (regression + non-failing test) · re-derived y` · `REVIEWER r2: object · fence adequacy · HIT (4 evasions) · re-derived y` · `REVIEWER r3: object · terminating round · HIT (the :538 gap, the third slice, the missing positive control) · re-derived y`.

---

## 9. ⏱ THE WINDOW CLOSED 2026-09-07 — **THE CRITERION IS UNEVALUABLE. THE BATCH DOES NOT CLOSE, AND ITS OWN PRE-REGISTERED RULE SAYS EXTEND.**

**Alert `cecd4a47` fired on schedule.** Population read exactly as pre-registered — `closed_trades` where `closed_at >= 2026-08-31T11:30:47Z`, **44 rows**.

**Producers present, ENUMERATED never `LIKE`:** `kraken_ws_book_mid` **25** · `kraken_equities_ws_mid` **17** · `(null)` **2**.

⛔⛔ **THE TOUCHED ARM HAS ZERO ROWS.** The criterion's three PASS conditions are all scoped to `exit_price_producer IN ('kraken_rest_poller','kraken_rest_rate_limited_reserve')`. **Neither producer appears in the window. `touched_arm_rows = 0`.**
⇒ ✅ **THE PRE-REGISTERED RULE FOR THIS EXACT CASE APPLIES: *"ZERO reserve rows = EXTEND, not pass/fail."*** The batch does **not** close, and it did **not** fail — **the arm it instruments was never exercised.**

⚠️⚠️ **AND A CORRECTION I OWE, RECORDED BEFORE THE RESULT: I REPORTED THIS GATE AS "PASSING 44/44" EARLIER TODAY. THAT WAS THE WRONG ARM.** I measured `exit_observed_at_ms` across **all** producers and found 44/44 non-null — **true, and about producers the criterion does not test.** The criterion asks only about the two REST arms, and there are none. ⇒ **A real measurement of the wrong population, reported as a pass. `wrong-object`, caught by reading the criterion instead of trusting my own earlier query.**

### ★ WHY THE ARM IS EMPTY — AND IT IS THE SAME FINDING AS `B-EXIT-BOOK-AGE-STAMP`'s C4
**The REST fallback is not firing because the WebSocket path is healthy.** Measured the same day: `withRestPrice=0` across 7,197 exit-evaluation cycles; `ENGINE_WS_PRICE` 19,842 vs `REST_FALLBACK` 0; the 5-second subscription audit reporting `total_positions=6 subscribed=6 missing=0 stale=0`.
⇒ ⛔ **THIS BATCH INSTRUMENTED A DEGRADED-MODE PATH, AND THE SYSTEM IS NOT DEGRADED.** The criterion can only be satisfied by a condition we do not want to occur.

### ⇒ DISPOSITION — BOUNDED, NOT AN OPEN WAIT
⛔ **`workflow-10`: an observation that does not meet its criterion is a RESULT, not a delay, and must never quietly wait forever.**
**This is the SECOND batch this week whose criterion requires an unexercised failure path** (`B-EXIT-BOOK-AGE-STAMP` C4 is the first). **Langston's stopping rule there — five fires, then the criterion is declared undischargeable with this instrument and the disposition is recorded — is the right shape here and is adopted:**
1. **EXTEND once**, re-armed with the same criterion, unchanged.
2. ⛔ **If the arm is still empty at the next fire, that is the RESULT: the criterion is not satisfiable while the WS path stays healthy**, and the batch converts recording that — either by re-scoping the assertion to a path that IS exercised, or by retiring it with the reason stated. **Not a third window.**
⚠️ **The bar is NOT lowered. Nothing about the three PASS conditions changes.**

---

## 9a. ⏱ RE-READ 2026-09-09 — **THE EXTEND IS EXECUTED, NOT MERELY DECIDED. THE ARM IS STILL EMPTY, ON A POPULATION HALF AGAIN AS LARGE.**

⛔ **FIRST, WHAT §9 DECIDED AND NEVER DID: the EXTEND was recorded on 09-07 and NO SUCCESSOR ALERT WAS EVER ARMED.** `cecd4a47` fired `2026-09-07T12:08:12Z` and sat **active, unacked, unresolved for two days** — enumerated at the alert store, not recalled. ★ **A disposition written into a report with nothing armed behind it is the `#1005` shape: naming is not placing.** ⇒ **today's read is the FIRST fire discharged late, NOT the second fire — so the stopping rule below has NOT yet been reached.**

**Same population, same pre-registration, re-read at `2026-09-09`:** `closed_trades` where `closed_at >= 2026-08-31T11:30:47Z`. **66 rows, up from 44.**

| producer *(ENUMERATED, never `LIKE`)* | n | carry `exit_observed_at_ms` | missing |
|---|---|---|---|
| `kraken_ws_book_mid` | **42** | **42** | 0 |
| `kraken_equities_ws_mid` | **21** | **21** | 0 |
| `(none)` | 3 | 0 | 3 |
| ⛔ **the touched (REST reserve) arm** | **0** | — | — |

⛔⛔ **`touched_arm_rows = 0` FOR THE SECOND CONSECUTIVE READ, on a population that grew by 22 rows.** The three PASS conditions are scoped to `exit_price_producer IN ('kraken_rest_poller','kraken_rest_rate_limited_reserve')`; neither appears. ⇒ ✅ **THE PRE-REGISTERED RULE STILL APPLIES: *"ZERO reserve rows = EXTEND, not pass/fail."***

### ⚠️ A WRONG-OBJECT READ CAUGHT BY ITS OWN CONTROL, BEFORE IT WAS REPORTED
**My first pass today returned `null_observed` equal to the FULL count on every producer — 42/42, 21/21, 3/3 — which contradicted the 09-07 record.** ⛔ **I did not report it.** The control — *enumerate the keys the object actually carries* — returned **zero** metadata keys matching `observ`/`exit`/`age`. ⇒ **`exit_observed_at_ms` is a COLUMN of `closed_trades`, not a metadata key; I had queried a key that has never existed, and a key that does not exist is null on every row.**
★ **The discriminator that settled it: `count(exit_observed_at_ms)` all-time = 92 non-null, most recent `2026-09-09 14:01:11Z`.** **The instrument works; my first pass was pointed at the wrong object.** ⚠️ **Fifth `wrong-object` instance inside my own corrections rather than in the original code — the pattern is not in the system, it is in me.**
✅ **AND IT IS THE SAME FAILURE §9 ALREADY RECORDS ONE TURN EARLIER, in the opposite direction:** there I measured the RIGHT column on the WRONG population and called it a pass; here I measured the WRONG object on the right population and nearly called it a regression. **Same slug, both signs.**

### ⇒ DISPOSITION — EXTEND, **ARMED THIS TIME**
1. ✅ **Successor alert armed** carrying the criterion and the stopping rule **verbatim and unchanged**. **The bar is not lowered.**
2. ✅ **`cecd4a47` RESOLVED** — its action *(run the joint read, enumerate the arms, extend if the reserve arm is empty)* is now discharged, and the continuation lives on the successor. ⛔ **Resolved rather than acked deliberately: an ack silences the re-surface without discharging the work (`#982`), which is exactly how this one went quiet for two days.**
3. ⛔ **AT THE SUCCESSOR'S FIRE, AN EMPTY ARM IS THE RESULT — NOT A THIRD WINDOW.** The batch then converts, recording either a re-scope of the assertion onto a path that IS exercised, or its retirement with the reason stated.

### ⛔ METHOD CORRECTION — **THE RIGHT ANSWER OFF THE WRONG LIST, AND THE CONTROL IS WHAT ACTUALLY CARRIES IT**
⚠️ **My `touched_arm_rows` query enumerated SIX producer names I supplied from memory — `kraken_rest_ticker`, `kraken_rest_book`, `kraken_rest_ohlc`, `kraken_equities_rest`, `rest_reserve`, `kraken_rest`. The criterion names exactly TWO, and NEITHER of mine was one of them:** `kraken_rest_poller` and `kraken_rest_rate_limited_reserve`. ⇒ ⛔ **That query could not have detected the arm it was written to test. A zero from it means nothing.**
✅ **THE RESULT SURVIVES, BUT ON THE CONTROL, NOT ON THAT QUERY.** The all-time producer census returns the **complete** set of values `exit_price_producer` has ever held across all 732 closed rows: `(none)` 640 · `kraken_ws_book_mid` 61 · `kraken_equities_ws_mid` 22 · `kraken_equities_ws` 9. **Four values, exhaustively enumerated. Neither criterion producer appears anywhere in the table's history.** ⇒ **`touched_arm_rows = 0` is established BY THE EXHAUSTIVE CENSUS, and I am recording that rather than letting a guessed list stand as the method.**
★ **This is the third `wrong-object` in a single hour's work on one gate — a metadata key that never existed, a grep that matched another record's body, and a hand-supplied enumeration that omitted both targets. Every one was caught by a control and none reached a report.** ⇒ ⛔ **The lesson is not "be careful": it is that the criterion's OWN literals must be copied from the criterion, never retyped from memory.** ✅ **The successor alert's body now carries both producer names verbatim so the next read cannot re-derive them.**

### ⛔ LABEL CORRECTION — **"VERBATIM AND UNCHANGED" WAS A FALSE SELF-CERTIFICATION, AND THE POINT IS WHAT IT INVITES** *(Langston, 2026-09-10)*
**§9a above and the first successor alert both said the criterion was carried *"VERBATIM and UNCHANGED."*** ⛔ **It is not, in the strict sense — and Langston read the alert row rather than my report of it.** The differences, now stated on the gate itself so nobody has to diff it:
| | |
|---|---|
| ✅ **unchanged** | the three PASS conditions, the FAIL conditions, the population, the pre-registered zero-rows rule. **The bar is not lowered.** |
| ➕ **dropped** | `cecd4a47`'s `aee:1244`/`:1285`/`:1324` arm citations, in favour of enumerating producer VALUES — **a better instrument, but a change** |
| ➕ **added** | a **binding stopping rule**, and the **column-not-metadata-key trap** |
⇒ ✅ **CORRECT LABEL: *criterion unchanged, stopping rule added.*** ⛔ **Why it matters more than the wording: a self-certification of sameness INVITES THE NEXT READER TO SKIP THE DIFF.** ★ **Three of the four differences are improvements — which is exactly what makes the false label dangerous, because nothing about the outcome would have prompted anyone to check.**
✅ **ACTED, NOT JUST RECORDED:** the mislabelled gate `2e496a98` is **RESOLVED as superseded**, and **`0db25f1d-3da5-46e2-9303-09290eb447b5`** is armed for the same instant carrying the corrected label and the explicit difference list. ⛔ **Verified exactly ONE `#951` gate is in `scheduled` state.**
⚠️ **The two producer literals are now written into the gate body with an instruction to COPY rather than retype — because the 09-09 read retyped them from memory and omitted both.**

## 9b. ✅ CONVERTED 2026-09-11 — THE WINDOW ENDS AT THE OBJ-7 DEPLOY WITH THE ARM EMPTY; PASS 2 RE-SCOPED ONTO THE EXERCISED PATH; THE `closed_trades` LEG RETIRED WITH A TRIPWIRE *(Langston 20:17Z: approved in substance, one correction, four conditions)*

**THE GROUND, CORRECTED.** My dispatch said the stopping rule binds because this was the third read with the arm empty (44, 66, 82). ⛔ **That is false on the pre-registration's own terms.** The rule is written on FIRES, §9a itself calls the 09-09 read the first fire discharged late, and gate `0db25f1d-3da5-46e2-9303-09290eb447b5` is still `scheduled` for 2026-09-16T12:00:00Z and has never fired (alert store, read 20:21Z). **Reads are not fires.** **The true ground, and it is stronger:** `B-PRICE-SIDE-BY-JOB` OBJ-7 deployed at `2026-09-11T20:09:47Z` (`b597f1bf2`) and changes the exit leg's REST budget (P-7h), the arm this criterion depends on. The second and final window therefore cannot reach 09-16 as one population. It ends at the deploy boundary with the touched arm empty at 82 rows, and the stopping rule's disposition is taken early on that ground.

**THE TERMINAL READ** (pre-deploy build `a5273ad6d`, 19:52:14Z, `scripts/analysis/b_price_age_truth_terminal_read.sql`; Langston re-derived it exhaustively): population 82; `kraken_ws_book_mid` 53 (53 carry `exit_observed_at_ms`), `kraken_equities_ws_mid` 25 (25), no producer 4 (0); touched arm 0; reserve rows 0. **The no-producer residual DISSOLVES:** all four are `close_reason = never_filled` with a null `exit_price` and no exit read (CRV, APR, WLD, RAY; all `crypto_spot`, entry producer `crypto_ws_book_walk`; re-derived 20:21Z). They cannot be REST exits, so the arm is empty exhaustively, not by under-count.

### RE-SCOPE — PASS 2 MOVES ONTO THE ADAPTER'S RUNTIME RE-SERVE, WHICH IS EXERCISED
Evidence: the `[8.8.5][REST_BLOCKED] ... observedAt=` line the reserve branch emits (`live-pricing-adapter.ts:764`), read by `scripts/analysis/b_price_age_truth_reserve_age_split.py` and `.sh`, which now publish their parse census (condition 1) and the distinct-stamp measure (condition 2).

| window | matched | carrying a stamp field | parsed | dropped |
|---|---|---|---|---|
| 13:11:00-19:43:00Z, before the deploy | 10,682 | 10,682 | 10,682 | 0 |
| 20:09:37Z to the read at 20:21Z, after the deploy | 191 | 191 | 191 | 0 |

**PREVIOUSLY STATED: 10,664 re-serves. NOW: 10,682. REASON:** the window now ends at 19:43:00 rather than at the last line read near 19:42Z, and the runner reads the three newest rotated files, so the time window defines the population instead of the file set. Nothing is dropped in either window.

**The discriminating measure (condition 2): distinct `observedAt` values against re-serves, per symbol.** A re-stamp gives distinct equal to re-serves; an honest carry gives distinct near the number of successful upstream fetches.

| symbol, 0 `kraken_ws` cache writes | re-serves | distinct stamps | under 1 s | median age |
|---|---|---|---|---|
| BTC/USD | 1,183 | 387 | 0.0% | 29.8 s |
| ETH/USD | 1,184 | 385 | 0.0% | 29.8 s |
| SOL/USD | 1,187 | 383 | 0.0% | 29.8 s |
| XRP/USD | 1,189 | 380 | 0.0% | 29.8 s |
| ADA/USD | 1,188 | 380 | 0.0% | 29.8 s |

About 3.1 re-serves per stamp, and about 385 stamps over 23,520 s is one per ~61 s, the refresh rung. **Positive control:** RAY/USD, WebSocket-fed (448,267 cache writes in the window), shows 1,192 re-serves over 1,141 distinct stamps and 91.7% under 1 s, so the instrument does separate continuous rewrites from a carried stamp. **After the deploy** (small n): the same five symbols show 32-33 re-serves over 10 distinct stamps each, 0.0% under 1 s, median 29.6 s; RAY/USD 27 over 27. `live-pricing-adapter.ts` changed across `a5273ad6d..b597f1bf2`, so this is re-measured after the restart rather than asserted byte-inert.

### PASS 1 AND PASS 3 — THEIR OWN DISPOSITIONS (condition 3)
- **PASS 1 (a non-null stamp on the touched arm): discharged by construction, and at runtime.** `RestFetchResult.observedAt` is a non-nullable `number` (`live-pricing-adapter.ts:265`); the reserve arm returns a result only when `Number.isFinite(cached.observedAt)` and returns null otherwise (`:816-818`). At runtime, 0 of 10,873 re-serve lines carry `observedAt=none`.
- **PASS 3 (the source unchanged on a re-serve): discharged by construction.** The quote built from either fetch arm carries `source: 'kraken_rest'` as a literal (`live-pricing-adapter.ts:668`), with `producer` and `observedAt` taken from the fetch (`:672-673`). The engine's own direct REST leg never produces the reserve producer: it sets `kraken_rest_engine_fallback_mid` or `_last` with a null stamp (`active-execution-engine.ts:1635-1642`). ✅ **Cite confirmed by Langston (20:33Z, APPROVED):** his `aee:1289-1300` was wrong (it is the xStock sigma-refresh kick); at head the three arms are `aee:1545` (xStock `_eqTick.tsMs`), `:1589` (crypto WebSocket adapter, the touched arm) and `:1642` (direct REST, null by design, producer literal `:1638`), so `:668` and `:1635` stand. His whole-tree census adds that `kraken_rest_rate_limited_reserve` is constructed at exactly one site, `live-pricing-adapter.ts:817`.
- **Both stored-row halves go to the tripwire below**, because a proof by construction covers the code path, not a row written by some other path.

### RETIRE THE `closed_trades` LEG, WITH A TRIPWIRE (condition 4)
It cannot fire while the WebSocket path is healthy (82 closes, 0 on the arm). The stored-row assertion becomes a standing invariant: **any `kraken_rest_rate_limited_reserve` row landing with a null `exit_observed_at_ms`, a stamp equal to its close instant, or an `exit_price_source` other than `kraken_rest` fires.** **HOME: `B-PRICE-AGE-REFUSAL` (plan row `3b.f-b`), §9.4 disposition 2, as ruled.** ⚠️ Row `3b.f-b` was absorbed into `3n` r5 on 2026-09-11 (D7), and the place its age becomes decision-bearing is `3n` OBJ-8 row 8g, the crypto exit age check (`Scope Files/B_PRICE_SIDE_BY_JOB_SCOPE.md:256`). **So the tripwire lands as an 8g fence**, recorded here so the absorption does not orphan it.

### RESIDUALS, STATED NOT CLOSED
1. The zero-WebSocket partition rests on `[I7-WS-D][CACHE_WRITE]` being the complete write census for those rows (§6 names `:538` as another write site). Not proven, and not load-bearing: a re-stamp reads age near 0 on any partition.
2. The after-deploy re-measure is about 12 minutes and 191 lines: the same shape, on a small n.
3. **§5 item 1 survives verbatim: that the honest stamp ever reaches `closed_trades` is still unproven, and this retirement records that this instrument cannot prove it.**

**CLOSES:** gate `0db25f1d-3da5-46e2-9303-09290eb447b5` is resolved, not acked (`#982`), with this section as evidence. Langston sets `Review = Approved` on this section; the report then converts to the completion report at the batch close.
