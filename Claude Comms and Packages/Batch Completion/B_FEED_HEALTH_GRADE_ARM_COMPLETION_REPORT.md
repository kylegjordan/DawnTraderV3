# B-FEED-HEALTH-GRADE-ARM — COMPLETION REPORT — ✅ CLOSED 2026-11-06 (Langston confirmed Step 11, 03:39:05Z, Discord `1568107431391657995`)

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` · **Sprint plan row:** 3a · **Issue:** `#1123` (the `feed_health` leg) · converted from the progress report below, which is kept as written.
**Close ruled:** Langston, Discord `1568102498978504715` (2026-11-06 ~03:25Z): *"PROCEED to Steps 10-11 with four amendments. I re-derived the read of record myself rather than ruling on reported fact."* — all four are applied below.

## 0. ⚠️ OPEN AT CLOSE — stated first
| item | owner | home | closes when | fails when |
|---|---|---|---|---|
| **Leg 3 — the class alarm seen to fire on a REAL non-healthy cycle**: UNPROVEN | CC-B | a named open-at-close item in `B-CRYPTO-FEED-WATCHDOG`'s (`#1232`, row 33a) completion report, with its carrier named (Langston amendment 2; §9.4 disposition 2, a Kyle-agreed batch, no new slot) | a real non-healthy cycle prints on a carrier that survives | #1232 closes with it still unfired and does not name its successor |
| **The recorder arm has no per-cycle carrier**: since #1232 the alarm grade is the worse of the recorder grade and the class grade (`feed-integrity-monitor.ts:376`), but the liveness line prints only the class arm (`feed-integrity-auto-check.ts:31-34`); the recorder arm's only durable carrier is `/tmp/feed_health_<date>.json`, rewritten every cycle, and its not-graded states return `healthy` (the `#546` shape) | CC-B | same #1232 item (Langston amendment 2) | the recorder arm prints on the liveness line, graded and not-graded told apart | — |
| **The unset reconnect page thresholds** (`#1209` gate row) | CC-B | folded into row 3a2 `B-WS-RECONNECT-BACKOFF-RESET` (`#1209`, QUEUED) — §1(b) 3 | the thresholds move into `feed_health` per class | — |
| **5 `feed_health` rows that can never clear** (a deleted user, 2025-10-24/25) | — | §9.4 disposition 5, a permanent floor | — | — |

## 1. (a) WHAT DATA CAME IN — against the criteria as pre-registered (quoted in §3 below)
- **Objective 1 (armed at boot): PASS** — `feed_health` prefetched, rows=5, at every restart read (§2).
- **Objective 2 (the clear): DISCHARGED** — the first cycle after the 2026-10-17 13:03:42Z deploy acknowledged **1,093** of 1,098; the remaining 5 are the floor above.
- **Objective 3 (the distribution): PASS on the distribution**, on Thursday 2026-11-05 (the Monday 10-19 read was never run and its logs are rotated — §2c). **The quantity, stated as Langston amended it (1a):** the maximum over cycles of each class's **freshest**-symbol age over the trading adapter's subscribed set — on crypto regular that set was **2..11 symbols**. So the 3,636 ms crypto margin is a margin on a minimum over at most 11 symbols, **not a claim about the freshness of the whole crypto feed.** Per-segment table: §2c. **Re-derived independently by Langston** over the same logs (1,048 lines to 03:15Z, every cell matching).
- **The census scope (1b):** the 1,042 / 1,048 healthy lines are the **per-class arm only**. Since #1232 deployed (2026-11-04 15:47Z) the alarm grade is the worse of the class arm and the recorder arm, and the recorder arm never appears on the line counted. Langston's control: zero `Info:` / `Critical:` lines in `out.log`, so the report's `issues` have no stdout carrier; the daily `/tmp` file does carry them (11-04: *"crypto recorder live share NOT GRADED (warming)"*; 11-05: `issues: []`). ⇒ **leg 3 is unfired on the class arm across 1,048 cycles, and on the recorder arm at one surviving snapshot per day.**
- **Code generation, stamped (1c):** the non-firing through the 2026-10-21 → 11-04 half-dark recorder was graded by the **pre-#1232** code (class arm only); the 11-05 distribution came out of the worse-of-two (post-#1232).
- **Leg 1 (capability): PROVEN** — the unit test drives the liveness line to `warning` and `critical` for both classes. **Leg 3 (invocation): UNPROVEN** (§0).
- **Crypto `symbols`:** 2..11 in the 11-05 regular session, 6-12.5 h after the last restart ⇒ not a restart artifact by the pre-registered test. The count is the adapter's **subscribed set** — `getI8EWsHealth()` iterates `this.subscribedSymbols` (`server/exchanges/kraken/kraken-websocket-adapter.ts:2322`, inside `getI8EWsHealth()` at `:2299`). **That the set follows what is queued or open is a HYPOTHESIS — the subscribe callers were not traced.** The reach bound from (1a) is the argument for #1232's coverage grade.

## 1. (b) WHAT DECISION OR ACTION WAS TAKEN ON IT, AND BY WHOM
1. **Close** (Langston, msg `1568102498978504715`): objective 2 DISCHARGED, objective 3 PASS on the distribution, leg 1 PROVEN, leg 3 UNPROVEN. **Leg 3 re-homed to #1232** — the ruling of 2026-10-10 homed it beside 3a1's liveness consumer, but 3a1 CLOSED 2026-10-17; #1232's recorder grade is the instrument that can see a partial outage. **Placement condition:** #1232's watch ends 2026-11-06 ~15:47Z, so leg 3 and the carrier gap go in as a named open-at-close item in its completion report; if #1232 closes with leg 3 still unfired it says so and names its successor.
2. **Crypto `symbols`:** §9.4 disposition 5 on the count — no work.
3. **`#1209` gate row — not now, folded into row 3a2.** Corrected wording (Langston amendment 4): the reconnect page thresholds are not "env-only", they are **unset** — staging's `.env` and pm2 config carry neither, so the live thresholds are the code defaults, **3 warning / 5 critical completed reconnects per 1-hour ring** (`feed-integrity-monitor.ts:195` / `:198`). Sizing datum: 11-05's daily report read uptime 91.67 %, 1 ring reconnect, grade **C**; 11-04: 100 %, 0, grade A — an ordinary day sits two reconnects below the warning rung. Moving them into `feed_health` per class is `B-WS-RECONNECT-BACKOFF-RESET`'s work, since that batch changes how many reconnects happen.
4. **`ee1fd666-d05d-4ebc-aef4-e3ef7d92741b`** (the open-max-age nag): hand-resolved at Langston's Step-11 confirm with this report's commit as evidence (the Step-11 gate row below; its key has no resolve edge, `#1074`).

## 2. Objectives (scope r2)
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | arm the grade at boot | **YES** | §2 Step-7 table |
| 2 | the clear on recovery | **YES** | 1,093 acknowledged 2026-10-17 13:04:07Z; 5-row floor |
| 3 | the distribution across a weekday | **YES on the distribution; leg 3 UNPROVEN** | §2c, re-derived by Langston |
| 4 | the accessor for 3a1 | **YES** | `getLastLiveness()` shipped; 3a1 closed without consuming it |
| 5 | the recorder pairs | **YES** | the 8 pairs recording from 10 s after the 10-10 restart |

## 3. CI
`3a549e3a9` (first build): run `37571522019`, success. `162ae0537` (Step-9 rework, deployed 2026-10-17): run `39034690051`, success — TypeScript Check, Test Suite, Build, Docker Build. No code changed at this close.

## 4. Governance files changed — the Step-10 ledger
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry set to Step 11, result and open-at-close items |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-10 entry given its plain-language outcome |
| T1 | PHASE_19_PLAN.md | N/A | row 3a is a sprint row; PHASE_19_PLAN takes nothing new since 2026-09-30 and has no 3a row |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | own position updated; no project-consensus truth changed |
| T1 | the batch SCOPE | ✅ | written at Step 1 (r2) with the 10-10 dated amendment; unchanged at close |
| T1 | the batch PRE_AUDIT | ✅ | written at Step 2; unchanged at close |
| T1 | COMPLETION_REPORT | ✅ | this file, converted from the progress report |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B row 3a set to Step 11; CC-A, CC-C, CC-INFRA lists not mine |
| T1 | Langston's MEMORY.md | BLOCKED — Langston's own write | asked in the Step-11 dispatch |
| T2 | SYSTEM_MANUAL.md | ✅ | the freshest-age alarm section: measured reach — the class arm stayed healthy through a half-dark recorder; partial outage is the recorder arm's job |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the feed-integrity monitor entry: the liveness line carries the class arm only; the recorder arm's only carrier is the `/tmp` daily file |
| T2 | RUNNING_ISSUES.md | ✅ | `#1123` `feed_health` leg closed; `#1209` annotated with the unset thresholds and the fold into row 3a2 |
| T2 | SPRINT_TO_LIVE_PLAN.md | ✅ | row 3a status and report link |
| T2 | CHANGES_AND_FIXES.md | N/A | no new fix at this close |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no roadmap change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no tunable added or changed |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention changed |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | the 15-minute-bar working list is unaffected |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | the method did not change |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | the reviewer's build did not change |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | N/A | no new pattern instance at this close |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | the 2026-10-17 declared-open row flipped to `open-retired` at the close (Langston: N/A was wrong — the standing `open` row would re-mint the open-max-age nag once `ee1fd666` resolved) |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check did not run in this batch |
| — | `B-CRYPTO-FEED-WATCHDOG` Step-7 record | ✅ | leg 3 + the recorder-arm carrier gap carried in as an open-at-close item (§0) |

## 5. New findings in passing
None beyond §0.

## 6. Honest residual
- The alarm has **never been seen to fire on a real failure** on either arm. Its capability is unit-tested; its invocation is not established.
- Objective 3 was read 18 days late, on a Thursday rather than the pre-registered Monday, with the DST-aware session labels (record item (a), fixed before the 11-01 change).
- The class arm measures the freshest symbol over at most ~11 crypto symbols; it says nothing about the rest of the crypto feed.

---

# (was) B-FEED-HEALTH-GRADE-ARM — PROGRESS REPORT · read of record RUN 2026-11-06 (§2c)

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` · **Sprint plan row:** 3a (paired with 3a1) · **Issue:** `#1123` (+ `#439`, carried as pre-audit §D)
**Scope / pre-audit / change list:** `Scope Files/B_FEED_HEALTH_GRADE_ARM_SCOPE.md` (r2), `…_PRE_AUDIT.md`, `Change Lists/B_FEED_HEALTH_GRADE_ARM_STEP4_CHANGE_LIST.md`
**Code:** `3a549e3a9` · **Deployed:** CC-C's release `ad01f5339b5…` at 2026-10-10T11:59:29Z (Kyle-authorised; Langston APPROVED this batch at `3a549e3a9`, 11:57Z, re-affirmed 14:16Z); restarted again 17:05:16Z by CC-C's own deploy (`e1b37c2d5`).
⚠️ **This is a progress report, not a close.** Two objectives depend on events that have not happened yet. The criteria below were written in the scope before the deploy and are quoted, not restated.

## 1. What the batch is for
The feed-health grade's per-class liveness part had been silently switched off: its settings were never loaded at startup. Its alerts also had no working way to clear: the recovery branch tested an alert id that was never set. This batch loads the settings at boot, clears what the grade raises when the feed recovers (by acknowledging the dashboard alerts), prints a per-cycle per-class liveness line so the grade can be measured, exposes that liveness to 3a1, and fixes the crypto recorder's subscription naming, which had dropped 8 pairs (GBP/USD among them).

## 2. Steps completed, with evidence
| step | evidence |
|---|---|
| 1-2 | scope r2 and pre-audit, Langston PROCEED (10-07) |
| 3 | `3a549e3a9` |
| 4 | Langston APPROVED at `3a549e3a9` (Discord `1558448355061792849`, 11:57:24Z; reconciled 14:16:05Z; written into the change list by CC-C, `2288943e6`). Two record items: (a) `sessionSegmentUtc` uses fixed UTC bounds valid only to 2026-11-01; (b) the recovery read must be a real non-healthy → healthy transition, because `lastStatus` starts as `healthy` |
| 5 | CI on the deployed sha (CC-C's release record) |
| 6 | deployed 2026-10-10T11:59:29Z |
| 7 (partial) | below; recorded in `Scope Files/RELEASE_DEPLOY_2026-10-10_PLAN.md`, "CC-B Step 7" |

**Step 7 so far:**
| objective | verdict | evidence |
|---|---|---|
| 1 — armed at boot | **PASS** | `[B72][warmup] prefetched module_constants module='feed_health' rows=5` at both restarts (11:59:22Z, 17:05:14Z); no `feed_health config not warmed` line since |
| 2 — the clear | **NOT YET RUN** | every `[FeedIntegrity][liveness]` line since the deploy reads `class=crypto_spot … grade=healthy`. No non-healthy → healthy transition has occurred, so the acknowledge path has had nothing to do. Backlog unchanged at **1,088** unacknowledged `feed_health` rows (1,083 + 5, two users) |
| 3 — the distribution | **NOT YET RUN** | the window is "one full weekday after deploy" and the deploy fell on a Saturday. No `xstock_spot` liveness line has printed over the weekend (recorded, not interpreted) |
| 4 — the accessor for 3a1 | **shipped** | `getLastLiveness()` (`ClassLivenessReading`, `thresholdPresent`, `configMissing`); 3a1 does not consume it yet (3a1's cohort count is its own) |
| 5 — the recorder pairs | **PASS** | the 8 misnamed pairs (GBP/USD, EUR/USD, AUD/USD, LTC/USD, LTC/USDT, LTC/USDC, ETC/USD, MLN/USD) each have rows in `crypto_spot_ticker_snap` from 11:59:28-29Z, about 10 s after the restart. **0 rows for every one of them in the 24 h before** (control BTC/USD 13,414) |

## 2b. Step 9 — the rework (2026-10-17) and where it stands
**Why there was a Step 9:** the Step-7 read (2026-10-16/17) found the grade locked at critical for **49 of 49** saved daily reports (2026-08-30 → 10-17) — the status graded a cumulative-since-boot uptime that reached 0 % and never recovered — so objective 2's clear was unreachable, and the monitor read a reconnect counter that resets on every open (blind to completed reconnects). Design, conditions and the r4 approval: `Langston Design Asks/B_FEED_HEALTH_GRADE_ARM_STEP9_R1_DESIGN.md`; change list `Change Lists/B_FEED_HEALTH_GRADE_ARM_STEP9_CHANGE_LIST.md`.
| step | evidence |
|---|---|
| 3 | the Step-9 build (monotonic `reconnectsCompleted`; ring-window connection term with a `warming` state; per-class freshness graded; the xStock leg from the recorder, gated `recorder_warming`; the clear runs on every healthy cycle; the Feed Health card hoisted out of the dead telemetry gate) |
| 4 | Langston r4 APPROVED at `24acee2ec` (four in-commit conditions, all carried) |
| 5 | CI green 4/4 per job at the deployed shas |
| 6 | deployed `162ae0537` 2026-10-17T13:03:42Z, `07bf5d37b` 13:32:26Z (the card hoist); restarted again 14:12:52Z by `0dabe1a78` (row 59g part 2) |
| 7 | `Change Lists/STEP7_DEPLOY_162ae0537_2026-10-17.md`, row 3a — card drawn in Chrome |
| 8-9 | Langston's System Manual / SIM conditions discharged (condition 2 r2 at `0dabe1a78`); the S21 field list completed at this commit (his record item) |

**What the read of record has so far (the read itself is not run until its window closes):**
- **Objective 2 — the clear: DISCHARGED.** The first cycle after the 13:03:42Z deploy (13:04:07Z) acknowledged **1,093** (live 1,088 + paper 5, in two calls). Backlog before: 1,098. **Remaining 5:** one user id with no `users` row (a deleted account, 2025-10-24/25) — no dashboard can show them; §9.4 disposition 5, a permanent floor. The completion report states it.
- **The restart leg — measured on the two restarts since the deploy (13:32:26Z, 14:12:52Z):** the xStock leg reads `suppressed=true suppressReason=recorder_warming` on every cycle after each restart (not `market_closed`) ✅. During the warm-up the connection term is the direct per-interval count — `Uptime=warming(1..5), Reconnects=0(interval)` on snapshots 1-5 ✅. ⚠️ **The warm-up is SIX SNAPSHOTS, and on the 14:12:52Z restart that closed at 22.4 min, not 30:** snapshot 1 is taken at boot (14:13:15Z) and snapshot 2 at the next 5-minute clock tick (14:15:21Z), then every 5 min, so the 6th, first ready one, landed 14:35:18Z. The saved report `/tmp/feed_health_2026-10-17.json` was written at that 6th snapshot and reads `uptimePercent 100, reconnectBasis ring, ringSamples 6, ringSpanMs 1322504` with the summary line *"Connection uptime: 100.00% (last 22 min)"* — a number, with its real span beside it. The file is rewritten every cycle (`runFeedIntegrityCheck` records, generates and saves in one call), so the warm-up writes existed and were overwritten — **a retention property of the carrier, not a gap**. The 13:17Z read after the 13:03Z restart came from `GET /system/feed-health` (`routes.ts:15191`, `generateReport()` only — it does NOT write the file): served `uptimePercent null, reconnectBasis interval, ringSamples 4`. ✅ **RULED MET BY CONSTRUCTION (Langston, 2026-10-17, at `6ea752120`):** `connectionReading()` (`feed-integrity-monitor.ts:271`) is the only producer of `uptimePercent`, with two exclusive arms — ready ⇒ ring + number (`:275`), not ready ⇒ `interval` + `null` (`:277`); `generateReport` prints the warming text on null, else the number with its span (`:520-522`); the saved file and the served object come from the same call — so an in-warm-up write cannot carry a number. No in-window read is armed. The pre-registered text keeps its words (*"the 30-min warm-up"*); the measured mechanism sits beside it — **six snapshots, 22.4 min on the 14:12:52Z restart** — and the condition under test (a number only once ready, with its true span: *"100.00% (last 22 min)"*) is indifferent to the window's length.
- **Crypto `symbols` after a restart:** 13:32:51Z `symbols=1` → 13:35:07Z `3`; 14:13:15Z `1` → 14:30:09Z `2` (pre-restart lines read 5). Monday's read decides it: **≥ 5 on a weekday session ⇒ a restart artifact (§9.4 disposition 5)**; otherwise it is a real thin population and gets a home. ⚠️ **Langston: stamp each count against time since the restart** — the 1 → 3 and 1 → 2 counts were taken during the subscription ramp, a different population from the 5 before; comparing them unstamped manufactures a shrinkage finding.
- **The weekday leg:** NOT YET RUN — Monday 2026-10-19's US regular session is the first after the deploy.

## 2c. The read of record, run 2026-11-06 ~03:10Z (CC-B) — 18 days late, stated
⚠️ **The Monday 2026-10-19 read was never run** — the batch sat untouched from 10-18 (Kyle's 10-19 re-slotting moved the work). The 10-19 logs are rotated away, so the read of record is taken on the first full weekday the kept logs hold: **Thursday 2026-11-05**, with the DST-aware `sessionSegment` (`feed-integrity-auto-check.ts:17`, deployed — the record item (a) fix is IN, ancestor of the deployed head `0f4835b5a`).
- **Instrument:** every `[FeedIntegrity][liveness]` line in the kept stdout logs (`out__2026-11-04_*` … `out.log`, 11-04 08:25Z → 11-06 ~03:00Z): **1,042 lines, 1,042 `grade=healthy`**. Thresholds read live from `module_constants` `feed_health` (unchanged since 2026-06-26): crypto warning 5,000 / critical 10,000 ms; xStock warning 60,000 / critical 120,000 ms.
- **Objective 3, per class per segment, 2026-11-05 (UTC day), unsuppressed cycles:**

| class | segment | cycles | max freshest age | margin to warning |
|---|---|---|---|---|
| crypto | regular | 79 | 1,364 ms | 3,636 ms |
| crypto | pre_market | 67 | 507 ms | 4,493 ms |
| crypto | after_hours | 48 | 1,827 ms | 3,173 ms |
| crypto | overnight | 99 | 408 ms | 4,592 ms |
| xStock | regular | 77 | 136 ms | 59,864 ms |
| xStock | pre_market | 65 | 431 ms | 59,569 ms |
| xStock | after_hours | 48 | 98 ms | 59,902 ms |
| xStock | overnight | 95 | 8,223 ms | 51,777 ms |

  xStock suppressed: 8 cycles (overnight 4, pre_market 2, regular 2), reported as suppressed, not as a pass. **Every graded segment below warning, with margin ⇒ objective 3 PASS on the distribution.**
- **Leg 3 (a real non-healthy cycle): UNFIRED — and it did not fire through a REAL partial outage.** The crypto recorder was half dark 2026-10-21 → 11-04 (`#1232`) and the crypto class graded healthy on every line in the kept window, including 11-04 before shard 0 recovered at 12:13:26Z. **Mechanism (cited, not inferred):** the class grade is the FRESHEST symbol's age over the trading adapter's tracked set (`feed-integrity-monitor.ts` `computeLiveness`, `krakenWebSocketAdapter.getI8EWsHealth()`), so one live shard keeps the class healthy. That is the design this batch armed, and it is why `B-CRYPTO-FEED-WATCHDOG` built the per-connection recorder grade. ⇒ per Langston's 2026-10-10 ruling: **leg 1 PROVEN, leg 3 UNPROVEN, never a pass.**
- **Crypto `symbols`, stamped against time since restart (Langston's condition):** the 11-05 regular session ran 6-12.5 h after the last restart (08:08:30Z) and read **2..11** (overnight 3..27). ⇒ **NOT a restart artifact** (the pre-registered test was "≥ 5 on a weekday session ⇒ artifact"). The population is the trading adapter's subscription set, which follows what is queued or open — a real, variable population by construction, not a feed fault. Its home is a ruling (below).

### Proposed close (for Langston to rule — §6.7)
1. Close per the 10-10 ruling: objective 2 DISCHARGED, objective 3 PASS on the 11-05 distribution, leg 1 PROVEN, **leg 3 UNPROVEN**. The ruling homed leg 3 "beside 3a1's liveness consumer", but **3a1 is CLOSED (2026-10-17)**; proposed new home: `B-CRYPTO-FEED-WATCHDOG` (`#1232`, CC-B, in its 48 h window now), whose recorder grade is the instrument that can see a partial outage.
2. Crypto `symbols`: §9.4 disposition 5 — not a defect; the count is the subscription set by construction. Recorded, no work.
3. `#1209` gate row (env-only reconnect thresholds): proposed **record why not, for now** — they decide a per-hour page, but moving them is `B-WS-RECONNECT-BACKOFF-RESET`'s territory (row 3a2, `#1209`, queued); fold the namespace move into that batch rather than reopen this one.
4. At the close: hand-resolve `ee1fd666` with the close's evidence (the Step-11 gate row below).

## 3. ⛔ The close criteria, PRE-REGISTERED in the scope, quoted as written
- **Objective 2 (scope §1, *Verify*):** *"On staging after deploy: the unacknowledged `feed_health` count read before and after the first post-deploy healthy cycle (expected: 1,088 → 0 if no non-healthy grade intervenes)."* Re-pointed by Langston at Step 4: the "after" read is taken at the first **non-healthy → healthy transition**, not the first healthy cycle, because the monitor starts in `healthy`.
- **Objective 3 (scope §1):** *"**PASS:** per class, in every graded segment, the **maximum observed freshest age** stays below `warning_age_ms` with a stated margin (crypto 5,000 ms, xStock 60,000 ms, read 2026-10-06) — the report states the margin per segment. **FAIL:** any graded segment whose maximum reaches `warning_age_ms` without a matching real outage in the logs ⇒ the thresholds go back before 3a1 relies on them."* Population: *"one full weekday after deploy, every cycle, split by session segment"*; xStock weekend-closed cycles are *"reported as 'suppressed, n cycles', never as a pass."*
- **Objective 3's positive control (scope §1):** *"the forced bad grade from objective 2's staging check (a test-only hook, never in production) must show `warning`/`critical` on the SAME per-cycle line, so the line is shown able to report a non-healthy grade before its healthy readings count."*
  ⚠️ **GAP, stated:** no such hook exists. Searched at the deployed code: nothing in `feed-integrity-monitor.ts` or `feed-integrity-auto-check.ts`, and no mention in the change list or pre-audit. **Proposed (for Langston to rule):** the first REAL non-healthy cycle serves as the positive control. It is the same event objective 2 waits for, so one occurrence discharges both. No test hook goes into production code. If none occurs within the weekday window, objective 3 reports its healthy readings as **unproven by a positive control**, never as a pass.
  ✅ **RULED 2026-10-10 (Langston, four conditions; dated amendment in the scope beside the criterion):** the control splits into leg 1 (capability — a unit test drives `formatLivenessLines` with `warning`/`critical`, both classes: **DONE**, `b-feed-health-grade-arm.test.ts` "leg 1") and leg 3 (invocation — only a real non-healthy cycle, which also discharges objective 2; it is leg-3 evidence, not "the positive control"). If the window closes unfired: leg 1 PROVEN, leg 3 UNPROVEN, distribution as measured, never a pass; one extension at most, then close with leg 3 homed beside 3a1's liveness consumer and the 1,088 backlog stated as uncleared.

- **The read of record (objective 3, re-run) — pre-registered in the Step-9 design before the deploy, quoted as written:** *"From the deploy of this fix: **one full US regular session AND the first post-deploy restart**, read from the daily report files and the per-class liveness lines. PASS per class: every graded segment's maximum freshest age below `warning_age_ms` with its margin stated; the xStock leg present in session and `recorder_warming` (not `market_closed`) in the minutes after the restart. Objective 2: the first post-fix recovery acknowledges the `feed_health` backlog — read before and after (1,098 at 2026-10-17 ~08:05Z)."* Langston's addition: *"the restart leg states what the connection term reads during the 30-min warm-up (the direct reconnect term), and a report saved inside that window shows **"warming up"**, never a number."* **This supersedes objective 3's original window above** (it measured a grade that could not move).

## 4. What is unproven, and what would falsify it
- That the acknowledge path runs on a real recovery. It is unit-tested (four cases); it falsifies if a non-healthy → healthy transition leaves the 1,088 rows unacknowledged.
- That the thresholds hold across a weekday's sessions. It falsifies under objective 3's FAIL clause.
- The fixed-UTC segment label (record item a): it labels sessions correctly only while US daylight time lasts. **Disposition (§9.4 #2, folded into this batch):** replace `sessionSegmentUtc` with the DST-aware calendar (`getXstockSession` + `isInXstockWeekendClose`, which 3a1 r4 already uses) before this batch closes, and before the 2026-11-01 change. The objective-3 window (a weekday in October, EDT) reads the same either way.

## 5. Governance files changed so far
`BATCH_CATALOG.md` (entry, open) · `PHASE_HISTORY.md` (entry, open) · `SPRINT_TO_LIVE_PLAN.md` (row 3a: status and this report) · `RUNNING_ISSUES.md` (`#1123` annotated; `#1209` filed; `#1210` filed) · `SYSTEM_MANUAL.md` (the feed-health contract, ~`:7824-7853`, and `sections/PHASE7_SYSTEM_LIFECYCLE_AND_INFRASTRUCTURE.md`, Step 9) · `SYSTEM_IMPACT_MAP.md` (S21 and its B6.9 line, Step 9; S21's field list completed 2026-10-17) · `GOVERNANCE_EXCEPTIONS.md` (declared open, 2026-10-17) · this report.

## ⛔ STEP-11 GATE ROWS — read these before the close (added 2026-10-17, Langston's Step-9 r4 carrier note)
- ⚠️ **CORRECTED at close — see §1(b) 3: the thresholds are UNSET, not environment-only; live values are the code defaults 3 / 5 (`feed-integrity-monitor.ts:195` / `:198`).** As written at 2026-10-17: **The reconnect page thresholds are environment-only** (`FEED_WARNING_RECONNECTS` / `FEED_CRITICAL_RECONNECTS`, `feed-integrity-monitor.ts` `loadThresholds`; at the ruled ref `:175` / `:181`), while the `feed_health` DB namespace carries only `warmup_grace_ms`, `warning_age_ms`, `critical_age_ms`. Since Step 9 those two numbers decide a per-hour page. **Decide at Step 11, with the read of record in hand: move them into the `feed_health` namespace per class, or record why not.** Home: `RUNNING_ISSUES #1209` (§9.4 disposition 4 — a review scheduled here).
- **Hand-resolve `ee1fd666-d05d-4ebc-aef4-e3ef7d92741b` at the close (Langston, 2026-10-18):** the `gov-openmaxage` key has one site in the checker's `poller.mjs` — the mint — and none of its resolve sites carries it, and its predicate is monotone in the first timestamp of the declared-open row (`2026-10-17T14:50:00Z` row, "open since 2026-10-10T11:59:29Z"). So neither the open row nor the close clears it; resolve it by hand with the close's evidence. The instrument fault is homed (`#1074`, row 2.4b); filing the open row is what armed the nag — the stated trade, not a filing error. Cite that row by batch-id + timestamp, not line (new rows land at the top).
