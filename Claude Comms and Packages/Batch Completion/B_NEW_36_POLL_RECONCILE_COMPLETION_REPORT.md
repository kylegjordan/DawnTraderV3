# B-NEW-36 poll-reconcile — Completion Report

**Batch:** B-NEW-36 poll-reconcile (Weekend cron failure safety net)
**Closed:** 2026-05-31
**Deploy SHA:** `5f20c71` (PM2 #333 at 07:06:33Z)
**CI:** all-4-green at `5f20c71`, run `26706042673` (2m16s)
**Verification:** `[B-NEW-36][POLL_RECONCILE_CHECK] tick=600 insideWindow=true isPaused=true` log line at 07:16:38Z = safety net armed and verified live

---

## 1. Scope objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Detect Fri 29 May 8PM ET cron silent failure root cause | ❌ NO — unverified | Process was up + central-clock ticks fired normally + no exception. Possible causes (node-cron 4.x async-handler bug, GC, registration race) not isolated. **Out of scope per Langston Q6 ACK.** Logged as RUNNING_ISSUES #164 for blast-radius audit batch. |
| 2 | Add poll-based reconciliation independent of cron | ✅ YES | `xstockSpotScanner.clockTickHandler` invokes `reconcileWindowState()` every 30 ticks (= 30s); compares `isXstockMarketOpenUTC()` vs `scanner.isPaused`; on drift, invokes `runShutdownFromPoll`/`runRestartFromPoll`. |
| 3 | Refactor cron handlers to share core with poll handlers | ✅ YES | `runWeekendShutdownCore` + `runWeekendRestartCore` extracted with `triggerSource: 'cron' \| 'poll' \| 'boot'` param + `runPrewarm: boolean` toggle. Cron path runs prewarm; poll path skips. |
| 4 | Atomic mutex preventing cron + poll concurrent fires | ✅ YES | `inFlight` boolean on `sessionLifecycleController`; ATOMIC check+set (no awaits between guard and assignment); cleared in `finally` block; test #8 throws inside wrapped call and asserts mutex resets. |
| 5 | Post-mutex state recheck for cron-fired-during-detection race | ✅ YES | After acquiring mutex, both poll entries re-check `xstockSpotScanner.getIsPaused()` and no-op without audit row if state already matches. Test #9 verifies. |
| 6 | System-alert on poll-fire (Langston Q6 + structural revision #3) | ✅ YES | `writeMissedCronAlert()` writes severity=warning category=breakage to system-alerts.jsonl with title "B-NEW-36 weekend cron silently missed {shutdown\|restart} fire — poll-path caught up"; failure-safe try/catch never blocks reconcile. Tests #1+#2 assert alert shape. |
| 7 | Skip prewarm on poll path (catch-up semantics, Langston Q4) | ✅ YES | `runPrewarm: false` passed to core; `[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup` breadcrumb logged. Test #5 verifies zero prewarm calls. |
| 8 | audit-row meta.trigger_source distinction | ✅ YES | `AuditMeta` extended with `trigger_source?: TriggerSource`. Test #6 verifies poll-fire writes `"trigger_source":"poll"`. |
| 9 | Heartbeat log every 10 min for live proof-of-life (Langston Step-4 minor) | ✅ YES | `[B-NEW-36][POLL_RECONCILE_CHECK] tick={n} insideWindow={bool} isPaused={bool}` every 600 ticks. Verified live at 07:16:38Z post-deploy. |
| 10 | SSOT documentation in code (Langston structural revision #1) | ✅ YES | `reconcileWindowState()` docstring documents `scanner.isPaused` as canonical signal; all three paths (cron, boot, poll) pair pause/resume with trade-state mutation via shared core. |
| 11 | 9 new unit tests covering all drift states + race + mutex | ✅ YES | `b-new-36-poll-reconciliation.test.ts` — all 9 pass; adjacent suite (`b-new-36-lifecycle-controller.test.ts` 10 tests) all pass; tsc baseline 494 unchanged. |
| 12 | Langston Design ACK + Step-4 ACK | ✅ YES | Design ACK-W-REVISIONS (3 structural folded inline); Step-4 ACK to push (heartbeat minor folded). Both in `Langston Design Asks/B_NEW_36_*.md`. |

---

## 2. Honest scoping (Kyle pushback 2026-05-31 — "trust without root cause?")

**The trust argument:** the poll-reconcile is robust against the failure regardless of cause because it doesn't touch cron. It rides on the central-clock path that has **positive evidence** of firing reliably at the exact moment cron missed:
- `[B78.1][WS_TICK_RATE]` + `[A3.R9.0.C][METRICS]` logs fired every 60s without gaps at Sat 30 May 00:00:10, 00:01:10, 00:02:10 UTC.
- The event loop was alive. Whatever broke node-cron is specific to that library, not the underlying scheduler.

**Three-layer protection for Sun resume:**
1. **Primary:** node-cron fires `0 20 * * 0` at Sun 31 May 8PM ET = Mon 1 June 00:00 UTC → `runWeekendRestart` via cron → audit row with `meta.trigger_source='cron'`.
2. **Safety net:** if cron silently fails again, poll-reconcile detects window-vs-paused drift within 30s → `runRestartFromPoll` → audit row with `meta.trigger_source='poll'` + system-alert (severity=warning).
3. **Boot fallback:** if PM2 restarts between now and Sunday and the new boot is after the 8PM ET boundary, `init()` boot-reconciliation detects `insideWeekendWindow=false` → `xstockSpotScanner.resume()` + `unmarkAllXstockWeekendSuspended()` → audit row with `meta.trigger_source='boot'`.

Either way: 244 weekend-suspended xStock trades resume to `open` state; scanner resumes scan cycles; fresh xStock signals start firing.

**What's NOT fixed (blast-radius gap):** the underlying node-cron silent-failure mode is uninvestigated. RUNNING_ISSUES #164 logs the follow-up audit batch — 5 other node-cron schedules in /server have no equivalent safety net:
- `server/jobs/formula-auto-audit.ts`
- `server/jobs/feed-integrity-auto-check.ts`
- `server/services/awareness-scheduler.ts` ×2 (hourly + 6-hourly)
- `server/services/xstock-universe-cron.ts`

Audit must (a) check each for evidence of prior silent failures, (b) instrument each to log on every successful invocation, (c) decide policy (poll-reconcile parity vs pin node-cron version + open upstream bug vs replace library). Sequenced per Kyle directive 2026-05-31 to run AFTER this governance close.

---

## 3. Three structural revisions from Langston Design ACK-W-REVISIONS — addressed

| # | Revision | Resolution |
|---|---|---|
| 1 | SSOT for window state | Documented inline in `reconcileWindowState()` docstring + `SYSTEM_IMPACT_MAP.md §9.10.b`. `scanner.isPaused` is canonical; all three fire paths pair pause/resume with trade-state via shared core, so drift between scanner state and trade table is closed. |
| 2 | "Cron fired but poll arrived first" no-op test | Test #9 added. Simulates cron-completed-before-poll by setting `scannerIsPaused=true` BEFORE invoking `runShutdownFromPoll`. Asserts no new audit row + no system-alert (poll sees state-already-matches, no-ops without duplicate). |
| 3 | System-alert on poll-fire is HARD REQUIREMENT (not deferred) | Implemented in `writeMissedCronAlert()`. Wired into both poll-entry points. Failure-safe (try/catch around addAlert, never blocks reconcile). Tests #1+#2 assert correct shape (severity, category, title, metadata). |

Plus minor folded:
- **Q4 skip-prewarm log:** `[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup` added at both poll-fire sites.
- **Q5 mutex finally + throw test:** `inFlight` cleared in `finally`; test #8 throws inside wrapped call + verifies `_getInFlightForTest()` returns false post-throw + subsequent call DOES proceed.
- **Step-4 minor heartbeat:** `[B-NEW-36][POLL_RECONCILE_CHECK]` heartbeat every 10 min for positive proof-of-life.

---

## 4. Files changed

| File | Status | LOC delta |
|---|---|---|
| `server/services/session-lifecycle-controller.ts` | MODIFIED | +268 / −42 (refactored cron handlers + new shared core + new poll entries + writeMissedCronAlert + inFlight mutex + test accessors) |
| `server/asset_classes/xstock_spot/scanner.ts` | MODIFIED | +50 / 0 (new consts + clockTickHandler reconcile hook + reconcileWindowState method) |
| `server/tests/unit/b-new-36-poll-reconciliation.test.ts` | NEW | +298 (9 tests) |
| `Claude Comms and Packages/Langston Design Asks/B_NEW_36_WEEKEND_CRON_FAILURE_DESIGN.md` | NEW (governance trail) | +192 |
| `Claude Comms and Packages/Langston Design Asks/B_NEW_36_WEEKEND_CRON_STEP4_REVIEW.md` | NEW (governance trail) | +251 |

Net: 1 modified production file + 1 modified scanner + 1 new test file + 2 governance docs.

---

## 5. Verification gates

| Gate | Result |
|---|---|
| Local tsc baseline | 494 / 494 (UNCHANGED, 0 new errors) |
| Local vitest — new tests | 9 / 9 green (`b-new-36-poll-reconciliation.test.ts`) |
| Local vitest — adjacent | 10 / 10 green (`b-new-36-lifecycle-controller.test.ts`); no regressions |
| CI all-4-green | ✅ YES — TypeScript Check + Test Suite + Build + Docker Build all green at `5f20c71` run `26706042673` 2m16s |
| Staging deploy | ✅ YES — `npm run build` + `pm2 restart dawntrader`; PM2 #333 at 07:06:33Z; HTTP 200 |
| Boot reconciliation log | `[B-NEW-36][LIFECYCLE_INIT] insideWeekendWindow=true` + `[B-NEW-36][SUSPEND_XSTOCK]` + `[B-NEW-36][SCAN_PAUSE]` + `[B-NEW-36][LIFECYCLE_INIT_OK]` all fired correctly at 07:06:39 UTC |
| **Live heartbeat verification** | ✅ YES — `[B-NEW-36][POLL_RECONCILE_CHECK] tick=600 insideWindow=true isPaused=true` at 07:16:38 UTC = 10 minutes post-boot, exactly as designed; state-matches no-op confirmed |
| Mapper getClassMap | byAssetClass resolution correct (defensive_hedge crypto HVU, no orb in crypto, etc.) — confirms B.1.5 redeploy unblocker holding |

---

## 6. Governance files updated (Step 10)

| File | What was added |
|---|---|
| `BATCH_CATALOG.md` | Row added to B-NEW series table with full narrative + Langston ACK chain |
| `PHASE_HISTORY.md` | "B-NEW-36 poll-reconcile CLOSED 2026-05-31" paragraph appended |
| `CHANGES_AND_FIXES.md` | BUG-2026-05-31-B entry with symptom + verified-NOT-the-cause + fix + trust argument + blast-radius concern + lessons |
| `RUNNING_ISSUES.md` | #164 added — node-cron silent-failure blast-radius audit (5 other unprotected schedules) |
| `SYSTEM_IMPACT_MAP.md` | §9.10.b NEW — B-NEW-36 Weekend-Lifecycle Controller + Poll-Reconcile Safety Net (three fire paths, SSOT invariant, mutex semantics, blast radius) |
| `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | §4.26 added — Scheduled-task verification via audit-table rows (canonical pattern for any in-process scheduled task) |
| `MEMORY.md` (truth file + in-repo mirror) | CURRENT STATE block updated to 2026-05-31 with B-NEW-36 status + heartbeat verification |

---

## 7. Sun resume readiness

**Mon 1 June 00:00 UTC (Sun 31 May 8 PM ET) — ~17h from this report's writing.**

At the resume boundary, one of three things will happen:
1. node-cron fires normally → `runWeekendRestart(cron)` → `weekend_restart` audit row with `meta.trigger_source='cron'` + zero system-alerts. PRIMARY-PATH HEALTHY.
2. node-cron silently fails → poll-reconcile detects within 30s → `runRestartFromPoll` → `weekend_restart` audit row with `meta.trigger_source='poll'` + missed-cron system-alert (surfaceable via §10.5). SAFETY-NET TRIGGERED. Indicates cron regression for follow-up investigation.
3. Process restarted between now and Sunday → boot-reconciliation detects `insideWeekendWindow=false` post-Sunday-8PM → resume via boot path. AUDIT row with `meta.trigger_source='boot'`.

Either way: 244 `weekend_suspended` xStock trades flip back to `open`; scanner resumes scan cycles; fresh xStock signals start firing for the next trading week.

Active trading remains OFF throughout. Zero capital risk regardless of outcome.

---

## 8. Active-trading invariant

Per CLAUDE.md §5 #20: this batch operates on VTS / passive-learning path only.
- xStock scanner is the VTS scanner (passive).
- Trades suspended/resumed are VTS virtual trades (`vts_open_trades`).
- Active paper trading is OFF (Phase 19 turns it on; not now).
- Zero capital risk regardless of outcome.

---

## 9. Follow-up

**RUNNING_ISSUES #164** — node-cron silent-failure blast-radius audit. Scope: 5 other unprotected node-cron schedules in /server. Sequenced per Kyle directive 2026-05-31 to run AFTER this governance close. Concrete tasks: (a) audit each for evidence of prior silent failures via output artifacts, (b) instrument each to log on every successful invocation, (c) decide blast-radius policy.

---

*End B-NEW-36 poll-reconcile completion report (2026-05-31).*
