# B-PRICE-AGE-TRUTH — BATCH PROGRESS REPORT

# ⛔ OPEN — WAITING ON: a post-deploy CLOSE whose exit price came from the arm this batch changed

**Batch:** `B-PRICE-AGE-TRUTH` · **Issue:** `#951` · **Owner:** CC-C · **Phase 19, plan row 3b.f**
**change-class:** architecture · **Card:** `Observation`
**Deployed:** `2af2e0bacc1430a6452559b83ba7d3be15adc7be` @ **2026-08-31T11:30:47Z** (`dt-deploy --by CC-C`, engine resumed, identity asserted, migration 715 ms)

> **Why a PROGRESS report and not a completion report:** the work shipped and is verified in the runtime, but **the confirming artifact — the new producer token on a closed trade — requires a close to occur, and there have been ZERO post-deploy closes against 3 open positions.** Per `workflow-10`, a batch whose evidence needs a window gets this document, and it is **CONVERTED** into the completion report when the data is in **AND a decision has been taken on it** — not when the window merely elapses.

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
