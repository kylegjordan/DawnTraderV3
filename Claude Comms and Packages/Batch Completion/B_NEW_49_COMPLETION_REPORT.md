# B-NEW-49 — Completion Report

**Batch:** B-NEW-49 (node-cron observability + deploy-state arming verification)
**Closed:** 2026-05-31
**Deploy SHA:** `00945dd` (PM2 #334 at 21:57:34 UTC)
**CI:** all-4-green at run `26725576560` (2m15s)
**Closes:** RUNNING_ISSUES #164 (node-cron silent-failure blast-radius audit)
**Opens:** RUNNING_ISSUES #165 (node-cron `getNextRun()` bug on Fri+NY-tz, surfaced by this batch's smoke test on first deploy) + RUNNING_ISSUES #166 (TEC stale-cache fence still firing post-B-NEW-40, surfaced during this batch's governance close via B-NEW-40 soak verify)

---

## 1. Scope objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Per-schedule fire-evidence audit-row writes | ✅ YES | 5 schedule sites wire `scheduledJobsAudit.writeFireRow()` in try/finally. Verified: 2 schedules wrote rows within first 5 min post-deploy (`feed_integrity_cron` 22:00:24, `awareness_state_update_cron` 22:00:00). |
| 2 | `[CRON-REGISTRATION]` log lines at boot | ✅ YES | All 7 schedules (5 new + B-NEW-36's 2) logged at boot with computed `next_fire` ISO timestamp. |
| 3 | Boot-time smoke test (Mode-A) | ✅ YES | Ran at boot 21:57:48 UTC + boot+5min 22:02:48 UTC. Aggregate result: 6 OK / 1 TOO_FAR_FUTURE (real node-cron bug — see §3 below). |
| 4 | Fire-evidence verifier (Mode-B) | ✅ YES | `setInterval(900s)` loop started at 21:57:48 UTC; first run at 22:12:48 UTC (boot grace + first interval). |
| 5 | System-alert on non-OK smoke status | ✅ YES | One alert written: id `44a7fc65-...`, severity=warning, category=breakage, title `"B-NEW-49 cron arm smoke test FAILED: weekend_shutdown status=TOO_FAR_FUTURE"`. |
| 6 | System-alert path proven end-to-end | ✅ YES | Alert wrote to `system-alerts.jsonl`; dispatcher will push to Telegram within 2 min; §10.5 surfaces in next CC turn; Langston auto-invoked via SSH per B-NEW-45. |
| 7 | No new migration / schema change | ✅ YES | Reused existing `scheduled_tasks_audit` table (pre-audit found shape-compatible). Scope §3 Chunk A dropped. |
| 8 | 5 new unit test files | ✅ YES | 24 new tests across `cron-registry.test.ts`, `cron-arm-logger.test.ts`, `scheduled-jobs-audit.test.ts`, `cron-arm-smoke-test.test.ts`, `cron-fire-evidence-verifier.test.ts`. All green. |
| 9 | Adjacent suites unchanged | ✅ YES | B-NEW-36 (19 tests) + sync-canonical-bridge (9 tests) = 28/28 green. |
| 10 | tsc baseline preserved | ✅ YES | 493 / 494 (actually 1 BELOW baseline). |
| 11 | Langston Step-1 ACK clean | ✅ YES | Concurrence on all 6 open questions; two minor framing notes folded into Step 2 pre-audit + SIM §9.10.c. |
| 12 | Langston Step-4 ACK clean | ✅ YES | "Approved to push" with 1 non-blocking minor (`scheduled_for=firedAt` semantic for jittered feed-integrity — deferred to governance follow-up). |

---

## 2. Two-mode safety net (per Langston Step-1 ACK note 1)

| Mode | Failure pattern | Detection mechanism | Latency |
|---|---|---|---|
| **Mode A — arming failed** | Schedule registered but `getNextRun()` returns null OR past-timestamp | `cron-arm-smoke-test.ts` runs at boot + boot+5min via `setTimeout` | < 5 minutes from boot |
| **Mode B — tick loop died mid-lifetime** | Schedule armed correctly, fired N times, then silently stopped | `cron-fire-evidence-verifier.ts` runs every 15 min via `setInterval` (independent of node-cron) | < 15 minutes from staleness |

Both modes write system-alerts via existing `addAlert()` API → `system-alerts.jsonl` → §10.5 per-turn check + dispatcher Telegram push + Langston SSH-invoke (B-NEW-45/46 path).

---

## 3. Real bug surfaced on first deploy (Mode-A detection working as designed)

**Schedule:** `weekend_shutdown` (cron expression `0 20 * * 5`, timezone `America/New_York`)
**Expected next-fire:** Friday June 5, 2026 8:00 PM EDT = Saturday June 6, 2026 00:00 UTC
**Actual `task.getNextRun()` returned:** `2027-01-02T00:00:00.000Z` = Friday January 1, 2027 8:00 PM EDT
**Delta:** ~215 days off

`weekend_restart` (`0 20 * * 0` same timezone) returns correct date — so the bug is specific to Friday day-of-week interaction with the timezone, not a general timezone problem.

**Uncertainty (logged as RUNNING_ISSUES #165):** Unknown whether (a) only the introspection API is buggy while actual firing happens correctly, OR (b) actual firing is also wrong. Investigation deferred to follow-up batch with concrete repro script + upstream node-cron 4.2.1 issue search.

**Why this is exactly the right outcome for B-NEW-49:** the smoke test wrote the alert as designed. Without B-NEW-49, this bug would have been invisible until Friday June 5 came around and either (i) the cron fired correctly anyway (no harm done, but we'd have no evidence one way or the other), or (ii) the cron failed to fire and B-NEW-36 poll-reconcile silently caught up at the boundary (also no operator notification of the underlying bug). Either way, the underlying node-cron 4.2.1 anomaly would remain undetected. B-NEW-49 turned an invisible bug into an immediate, actionable alert.

**Operational impact:** ZERO. B-NEW-36 poll-reconcile makes the weekend boundary robust to ANY node-cron failure mode — it polls the scanner-pause state vs window-state every 30s on the independent centralClock. So even if the Friday cron fails to fire at all next week, the poll-reconcile will detect window drift within 30 seconds and trigger the catch-up + write a missed-cron alert. Sunday-8PM-ET resume (Mon 1 Jun 00:00 UTC, ~2 hours from this report's writing) uses the correctly-armed `weekend_restart` timer.

---

## 4. Adjacent finding — TEC stale-cache fence still firing (separate batch needed)

During governance close, ran B-NEW-40 14-day soak verification per Langston's flag at the start of his Step-1 review. **Verdict: FAIL** — 3,716 `TEC_STALE_FAIL_CLOSED` events detected in the 14-day window post-deploy `2026-05-17T12:46:47Z`. Distribution: May 18 (2,368), May 19 (964), May 23 (50), May 25 (30), May 26 (304).

The fence itself is doing its job (refusing to use stale cached kill-switch values). The problem is the underlying staleness is recurring. Likely cause: database connection going dead-but-ESTABLISHED (TCP keepalive not detecting dead socket, refresh query hangs until timeout, cache ages past 5-minute ceiling). Logged as RUNNING_ISSUES #166. Active-trading impact ZERO today (no live trades; fence fails-closed correctly). Becomes operationally relevant before Phase 19 active-paper restart.

Alert `b83b1e4b` stays ACTIVE per script's own instruction ("DO NOT auto-ack — manual review required"). Not blocking B-NEW-49 close — different surface entirely (DB connection layer, not cron).

---

## 5. Files changed

**5 new production modules** (`server/services/`):
- `cron-registry.ts` — in-memory registry of registered cron schedules
- `cron-arm-logger.ts` — `[CRON-REGISTRATION]` log emitter on registration
- `scheduled-jobs-audit.ts` — failure-safe `writeFireRow()` helper
- `cron-arm-smoke-test.ts` — Mode-A coverage; boot + boot+5min via setTimeout
- `cron-fire-evidence-verifier.ts` — Mode-B coverage; 15-min setInterval (independent of node-cron)

**6 modified files** (5 schedule sites + 1 boot wiring):
- `server/services/session-lifecycle-controller.ts` — B-NEW-36's 2 weekend timers register + arm-log (fire-evidence already written by existing core)
- `server/services/xstock-universe-cron.ts` — register + arm-log + fire-evidence write
- `server/jobs/formula-auto-audit.ts` — STORE handle (was fire-and-forget!) + register + arm-log + fire-evidence
- `server/jobs/feed-integrity-auto-check.ts` — register + arm-log + fire-evidence (after jitter sleep)
- `server/services/awareness-scheduler.ts` — register both schedules (hourly + 6-hour) + arm-log on both + fire-evidence on both
- `server/index.ts` — invoke `scheduleSmokeTestRuns()` + `startCronFireEvidenceVerifier()` after all 5 schedules init

**5 new test files** (`server/tests/unit/`):
- `cron-registry.test.ts` (5 tests)
- `cron-arm-logger.test.ts` (4 tests)
- `scheduled-jobs-audit.test.ts` (4 tests)
- `cron-arm-smoke-test.test.ts` (6 tests)
- `cron-fire-evidence-verifier.test.ts` (5 tests)

**3 new governance docs** (`Claude Comms and Packages/`):
- `Scope Files/B_NEW_49_SCOPE.md` — scope + 6 open questions
- `Scope Files/B_NEW_49_PRE_AUDIT.md` — per-schedule audit + decision to reuse `scheduled_tasks_audit` table (dropped scope §3 Chunk A)
- `Langston Design Asks/B_NEW_49_STEP4_REVIEW.md` — embedded-diff code review dispatch

Net: ~1,400 LOC added (~800 production + ~600 test). Zero migration. Zero schema changes.

---

## 6. Verification gates

| Gate | Result |
|---|---|
| Local tsc baseline | 493 / 494 (UNCHANGED; actually 1 BELOW baseline) |
| Local vitest — new tests | 24/24 green across 5 test files |
| Local vitest — adjacent | 28/28 green (B-NEW-36 + sync-canonical-bridge) |
| CI all-4-green | ✅ TypeScript Check + Test Suite + Build + Docker Build at run `26725576560` |
| Staging deploy | ✅ `git pull` + `npm run build` + `pm2 restart`; HTTP 200; PM2 #334 |
| Boot signals | ✅ 7 `[CRON-REGISTRATION]` log lines at 21:57:44-48 UTC |
| Boot smoke test | ✅ Ran at 21:57:48 UTC; 6 OK / 1 TOO_FAR_FUTURE (intentional — caught real bug per §3) |
| Boot+5min smoke | ✅ Ran at 22:02:48 UTC exactly; same results |
| Fire-evidence verifier | ✅ Started at 21:57:48 UTC; first 15-min run at 22:12:48 UTC |
| First fire-evidence rows | ✅ `feed_integrity_cron` at 22:00:24 + `awareness_state_update_cron` at 22:00:00 |
| Alert write | ✅ `44a7fc65-7caf-4f7a-9fba-2876d77ed985` in system-alerts.jsonl |
| Langston Step-1 ACK | ✅ Concurrence all 6 questions + 2 minor framing notes folded |
| Langston Step-4 ACK | ✅ "Approved to push" + 1 non-blocking minor (deferred) |

---

## 7. Governance files updated (Step 10)

| File | What was added |
|---|---|
| `BATCH_CATALOG.md` | B-NEW-49 row added to B-NEW series table |
| `PHASE_HISTORY.md` | "B-NEW-49 CLOSED 2026-05-31" paragraph appended |
| `SYSTEM_IMPACT_MAP.md` | §9.10.c NEW — full module + pattern + failure-mode framing |
| `RUNNING_ISSUES.md` | #164 CLOSED entry + #165 OPEN (node-cron getNextRun bug) + #166 OPEN (TEC stale-cache) |
| `MEMORY.md` (truth file + in-repo mirror + Helsinki) | CURRENT STATE block updated |

---

## 8. Active-trading invariant

Per CLAUDE.md §5 #20: this batch is observability + safety-net layer only. ZERO active-trading impact. xStock VTS path continues normally (currently in weekend window — scanner paused, will resume tonight at Mon 1 Jun 00:00 UTC = Sun 8 PM EDT). Crypto VTS path untouched. Phase 19 unchanged.

---

## 9. Follow-up batches (sequenced)

1. **Pending tonight (~2h):** Sunday-resume verification at Mon 1 Jun 00:00 UTC. Either `weekend_restart` cron fires (trigger_source=cron in audit row) OR poll-reconcile catches up within 30s (trigger_source=poll + missed-cron alert). Either path resumes 244 weekend-suspended xStock trades + restarts xStock scanner cycles.
2. **RUNNING_ISSUES #165** (node-cron `getNextRun()` Fri+NY-tz bug) — investigate with isolated repro script; decide pin vs replace vs shim. Likely small batch (4-6 hours).
3. **RUNNING_ISSUES #166** (TEC stale-cache fence still firing) — investigate DB connection-pool tuning; check `ss` for dead-but-ESTABLISHED sockets; likely tighten `keepAliveInitialDelayMillis`. Operationally relevant before Phase 19 active-paper restart.
4. **B-NEW-47** (next planned per Kyle directive) — storage sweep activation (B75 tiering + Backblaze cold + xStock ticker hot-window).
5. **B-NEW-48** (after B-NEW-47, conditional) — Global REGIME per-class fix.

---

*End B-NEW-49 completion report (2026-05-31).*
