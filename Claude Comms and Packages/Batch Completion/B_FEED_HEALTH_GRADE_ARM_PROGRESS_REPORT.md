# B-FEED-HEALTH-GRADE-ARM — PROGRESS REPORT · OPEN — waiting on the read of record: one full US regular session (Monday 2026-10-19) after the Step-9 fix

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
- **The restart leg — measured on the two restarts since the deploy (13:32:26Z, 14:12:52Z):** the xStock leg reads `suppressed=true suppressReason=recorder_warming` on every cycle after each restart (not `market_closed`) ✅. During the warm-up the connection term is the direct per-interval count — `Uptime=warming(1..5), Reconnects=0(interval)` on snapshots 1-5 ✅. ⚠️ **The warm-up is SIX SNAPSHOTS, and on the 14:12:52Z restart that closed at 22.4 min, not 30:** snapshot 1 is taken at boot (14:13:15Z) and snapshot 2 at the next 5-minute clock tick (14:15:21Z), then every 5 min, so the 6th, first ready one, landed 14:35:18Z. The saved report `/tmp/feed_health_2026-10-17.json` was written at that 6th snapshot and reads `uptimePercent 100, reconnectBasis ring, ringSamples 6, ringSpanMs 1322504` with the summary line *"Connection uptime: 100.00% (last 22 min)"* — a number, with its real span beside it. **The file keeps only its latest write, so whether a write INSIDE the warm-up said "warming up" is NOT MEASURED from it**; the one in-window read is the 13:17Z route read after the 13:03Z restart (`uptimePercent null, reconnectBasis interval, ringSamples 4` — warming). The pre-registered wording says "the 30-min warm-up"; the mechanism is 6 snapshots ≈ 20-25 min after a restart. **Stated for Langston, not reinterpreted.**
- **Crypto `symbols` after a restart:** 13:32:51Z `symbols=1` → 13:35:07Z `3`; 14:13:15Z `1` → 14:30:09Z `2` (pre-restart lines read 5). Monday's read decides it: **≥ 5 on a weekday session ⇒ a restart artifact (§9.4 disposition 5)**; otherwise it is a real thin population and gets a home.
- **The weekday leg:** NOT YET RUN — Monday 2026-10-19's US regular session is the first after the deploy.

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
- **The reconnect page thresholds are environment-only** (`FEED_WARNING_RECONNECTS` / `FEED_CRITICAL_RECONNECTS`, `feed-integrity-monitor.ts` `loadThresholds`; at the ruled ref `:175` / `:181`), while the `feed_health` DB namespace carries only `warmup_grace_ms`, `warning_age_ms`, `critical_age_ms`. Since Step 9 those two numbers decide a per-hour page. **Decide at Step 11, with the read of record in hand: move them into the `feed_health` namespace per class, or record why not.** Home: `RUNNING_ISSUES #1209` (§9.4 disposition 4 — a review scheduled here).
