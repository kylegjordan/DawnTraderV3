# B-FEED-HEALTH-GRADE-ARM — PROGRESS REPORT · OPEN — waiting on a weekday measurement window and the first real feed-health recovery

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

## 3. ⛔ The close criteria, PRE-REGISTERED in the scope, quoted as written
- **Objective 2 (scope §1, *Verify*):** *"On staging after deploy: the unacknowledged `feed_health` count read before and after the first post-deploy healthy cycle (expected: 1,088 → 0 if no non-healthy grade intervenes)."* Re-pointed by Langston at Step 4: the "after" read is taken at the first **non-healthy → healthy transition**, not the first healthy cycle, because the monitor starts in `healthy`.
- **Objective 3 (scope §1):** *"**PASS:** per class, in every graded segment, the **maximum observed freshest age** stays below `warning_age_ms` with a stated margin (crypto 5,000 ms, xStock 60,000 ms, read 2026-10-06) — the report states the margin per segment. **FAIL:** any graded segment whose maximum reaches `warning_age_ms` without a matching real outage in the logs ⇒ the thresholds go back before 3a1 relies on them."* Population: *"one full weekday after deploy, every cycle, split by session segment"*; xStock weekend-closed cycles are *"reported as 'suppressed, n cycles', never as a pass."*
- **Objective 3's positive control (scope §1):** *"the forced bad grade from objective 2's staging check (a test-only hook, never in production) must show `warning`/`critical` on the SAME per-cycle line, so the line is shown able to report a non-healthy grade before its healthy readings count."*
  ⚠️ **GAP, stated:** no such hook exists. Searched at the deployed code: nothing in `feed-integrity-monitor.ts` or `feed-integrity-auto-check.ts`, and no mention in the change list or pre-audit. **Proposed (for Langston to rule):** the first REAL non-healthy cycle serves as the positive control. It is the same event objective 2 waits for, so one occurrence discharges both. No test hook goes into production code. If none occurs within the weekday window, objective 3 reports its healthy readings as **unproven by a positive control**, never as a pass.
  ✅ **RULED 2026-10-10 (Langston, four conditions; dated amendment in the scope beside the criterion):** the control splits into leg 1 (capability — a unit test drives `formatLivenessLines` with `warning`/`critical`, both classes: **DONE**, `b-feed-health-grade-arm.test.ts` "leg 1") and leg 3 (invocation — only a real non-healthy cycle, which also discharges objective 2; it is leg-3 evidence, not "the positive control"). If the window closes unfired: leg 1 PROVEN, leg 3 UNPROVEN, distribution as measured, never a pass; one extension at most, then close with leg 3 homed beside 3a1's liveness consumer and the 1,088 backlog stated as uncleared.

## 4. What is unproven, and what would falsify it
- That the acknowledge path runs on a real recovery. It is unit-tested (four cases); it falsifies if a non-healthy → healthy transition leaves the 1,088 rows unacknowledged.
- That the thresholds hold across a weekday's sessions. It falsifies under objective 3's FAIL clause.
- The fixed-UTC segment label (record item a): it labels sessions correctly only while US daylight time lasts. **Disposition (§9.4 #2, folded into this batch):** replace `sessionSegmentUtc` with the DST-aware calendar (`getXstockSession` + `isInXstockWeekendClose`, which 3a1 r4 already uses) before this batch closes, and before the 2026-11-01 change. The objective-3 window (a weekday in October, EDT) reads the same either way.

## 5. Governance files changed so far
`BATCH_CATALOG.md` (entry, open) · `PHASE_HISTORY.md` (entry, open) · `SPRINT_TO_LIVE_PLAN.md` (row 3a: status and this report) · `RUNNING_ISSUES.md` (`#1123` annotated) · this report. The System Impact Map and the System Manual are owed at Step 10. The governance-overdue alert `8bae8664` is answered by this push.
