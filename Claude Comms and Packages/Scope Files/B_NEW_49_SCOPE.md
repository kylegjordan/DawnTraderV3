# B-NEW-49 — node-cron silent-failure mitigation + deploy-state arming verification

**Type:** Infrastructure / observability batch
**Scope owner:** CC + Langston autonomous iteration
**Authorization:** Kyle directive 2026-05-31 — "scope and share the scope with Langston. Iterate autonomously through the workflow to completion and full verification."
**Active trading impact:** ZERO (Phase 19 unchanged; pure observability + safety net layer)
**Sequencing:** scheduled immediately after B-NEW-36 poll-reconcile governance close (which just landed at commit `3612603`). Pre-empts B-NEW-47 (storage) per blast-radius severity — this is now the highest-priority infra batch.

---

## §0 Why — concrete evidence

**Trigger:** Kyle pushback 2026-05-31 — "If the root cause of the cron failure is not known, how can we trust that it is fixed?" — was right. Audit of all 5 other node-cron schedules surfaced a much bigger systemic problem than B-NEW-36 alone.

**Audit evidence (queried 2026-05-31, see RUNNING_ISSUES #164 entry for queries):**

| Schedule | Cron expr | Fire evidence source | Silent-failure window |
|---|---|---|---|
| xstock-universe-cron | `0 6 * * *` daily | `discovery_runs` table | **MISSED Sat 30 May 06:00 UTC** |
| formula-auto-audit | `0 3 * * *` daily | `/tmp/audit_report_YYYYMMDD.txt` files | **MISSED Sat 30 + Sun 31 May 03:00 UTC** |
| awareness-scheduler stateUpdate | `0 * * * *` hourly | `awareness_state_log.timestamp` column | **MISSED ~31 consecutive hourly fires** (May 29 22:00 → May 31 05:00 UTC) |
| awareness-scheduler reflection | `0 */6 * * *` every 6h | event-log row | gap aligns; precise confirmation deferred |
| feed-integrity-auto-check | `*/5 * * * *` every 5 min | `[FeedIntegrity] Waiting jitter` log lines | **MISSED ~372 fires** (12/h × 31h) |
| B-NEW-36 weekend-shutdown | `0 20 * * 5` Fri | `scheduled_tasks_audit` table | **MISSED Fri 29 May 20:00 ET = Sat 30 May 00:00 UTC** (already fixed by B-NEW-36 poll-reconcile) |

**Pattern:** ALL node-cron-based schedules in the process silently stopped firing in the same ~31-hour window (Friday 29 May ~22:55 UTC → Saturday 31 May 05:06 UTC). Independent mechanisms (central-clock setInterval ticks at 60s cadence, web server HTTP requests, scanner cycles via central-clock) continued operating normally throughout. The failure is **process-state-level and specific to node-cron's internal scheduler**, not a general process failure.

**Causal correlation with deploy + rollback (Kyle hypothesis, 2026-05-31 — strongly supported by evidence):**
- May 29 22:54 UTC — B.1.5 first deploy attempt
- May 29 ~23:09 UTC — Scanner crashed at boot (BUG-2026-05-31-A producer-consumer drift)
- May 29 ~23:10 UTC — Rollback executed (`git reset --hard 32d7e2c` + `npm run build` + `pm2 restart`)
- May 29 22:00 UTC ← last successful awareness fire; 22:55 UTC ← last successful feed-integrity fire
- May 31 05:06 UTC — Next PM2 restart (cause unverified — likely automated PM2 health-check or post-resource-pressure restart)
- May 31 05:06 UTC+ — ALL schedules resume firing normally

The silent-failure window begins within minutes of the failed B.1.5 deploy crash and ends precisely at the next PM2 restart. The rollback's PM2 restart did NOT fully clear node-cron's broken state. The strongest hypothesis: the crash-and-restart cycle from BUG-2026-05-31-A left node-cron's internal scheduler in a state where schedules registered successfully but never armed — no exceptions, no warnings, silent breakage until manual intervention.

**Current observability:** zero. Silent failures detected days later via manual archaeology only. Operators have no signal that node-cron has broken.

**Blast radius if it happens again:** every node-cron-based schedule stops, including: weekend-shutdown (already mitigated by B-NEW-36 poll-reconcile), xStock universe discovery (system stops refreshing tradeable symbol list), formula audits, feed integrity checks, awareness self-reflection. The system "looks healthy" via HTTP + scanner cycles but is silently accumulating drift.

---

## §1 In scope (this batch)

### 1.1 Per-schedule fire-evidence audit-row writes (CORE)
Every node-cron callback in the system MUST write a row to a shared `scheduled_jobs_audit` table on every fire (success path AND error path), so silent failures become detectable within their schedule period via SQL query.

Affected files (5 schedule registrations):
1. `server/services/session-lifecycle-controller.ts` — already writes to `scheduled_tasks_audit`; this batch standardizes the new shared table OR keeps the existing one and adds the 4 others to match its pattern (Langston Q1)
2. `server/services/xstock-universe-cron.ts` — already writes to `discovery_runs` via `runDiscovery()`; standardize meta + add to shared table OR keep
3. `server/jobs/formula-auto-audit.ts` — currently writes to `/tmp/` files only; ADD DB audit-row
4. `server/jobs/feed-integrity-auto-check.ts` — currently logs only; ADD DB audit-row
5. `server/services/awareness-scheduler.ts` — currently logs only; rely on `awareness_state_log.timestamp` for evidence (no new write needed) OR add audit-row for consistency (Langston Q1)

### 1.2 Cron-registration log with computed next-fire-time (CORE)
Every `cron.schedule()` call in the codebase MUST log on registration with the computed next-fire-time:
```
[CRON-REGISTRATION] job=<name> expr=<cron-expr> tz=<tz> next_fire=<ISO-timestamp>
```
This gives operators a positive boot-time signal that each schedule armed correctly. If the registration log appears but no subsequent fire-evidence row arrives by next_fire+grace, that's the silent-failure signature.

Helper added: `server/services/cron-arm-logger.ts` (NEW) exports `logCronArm(job, expr, tz, task: ScheduledTask)` that computes next-fire-time via `task.getNextRun()` (node-cron 4.x API) and writes the log line. Called from each of the 5 registration sites.

### 1.3 Post-deploy smoke test — boot-time + 5-min-after-boot (CORE)
New module `server/services/cron-arm-smoke-test.ts` (NEW). Run at server boot AND at boot+5min. For each registered cron schedule:
1. Compute next-fire-time via `task.getNextRun()`.
2. If next-fire-time is in the past OR more than 2× the schedule's natural interval in the future → ALERT (system-alert severity=warning category=breakage).
3. If next-fire-time is within expected window → log positive `[CRON-ARM-SMOKE] job=<name> next_fire=<iso> status=OK`.

Boot-time check catches "schedule didn't arm at all." +5min check catches "schedule armed but state corrupted before first fire." This is the deploy-state arming verification Kyle asked for.

### 1.4 Fire-evidence verifier (CORE)
New scheduled job `server/jobs/cron-fire-evidence-verifier.ts` (NEW). Runs every 15 minutes via `setInterval` (NOT node-cron — must use independent mechanism so it survives node-cron silent failure). For each tracked schedule:
1. Query `scheduled_jobs_audit` for last fire row.
2. Compute expected-by timestamp from schedule's natural interval × 1.5 grace.
3. If last fire is older than expected-by → write system-alert (severity=warning, category=breakage, title=`"cron schedule <name> has not fired since <last-iso> (expected by <expected-iso>) — likely silent failure"`).

This is the "detect silent failures within their schedule period" guarantee, not days later.

### 1.5 ScheduledTask handle exposure for `getNextRun()` introspection (CORE)
Each of the 5 registration sites currently stores the `ScheduledTask` handle (e.g., `_cronTask`, `friShutdownTask`). Expose a getter (`getRegisteredSchedules(): Array<{name, task, expr, intervalSeconds}>`) on a NEW shared module `server/services/cron-registry.ts` that the smoke test + fire-evidence verifier consume. Each registration site self-registers on boot via `cronRegistry.register({...})`.

### 1.6 Unit tests
NEW `server/tests/unit/cron-arm-logger.test.ts` — assert `logCronArm` computes next_fire correctly + writes the log line.
NEW `server/tests/unit/cron-arm-smoke-test.test.ts` — assert smoke test detects past/future next-fire mismatches + writes correct alert.
NEW `server/tests/unit/cron-fire-evidence-verifier.test.ts` — assert verifier queries audit table + alerts on stale fires.
NEW `server/tests/unit/cron-registry.test.ts` — assert registry tracks all 5 schedules + getter returns correct shape.
NEW `server/tests/unit/scheduled-jobs-audit.test.ts` — assert audit-row writes from each of 5 schedule sites use correct table + meta shape (idempotency / shape regression lock).

Total: ~5 new test files, ~20-30 tests.

---

## §2 Out of scope (deferred)

### 2.1 Replacing node-cron entirely
Migrating from node-cron to setTimeout-chain scheduler or systemd timers is a much larger refactor. This batch is observability + early detection; if observability shows node-cron continues to fail post-mitigation, a replacement batch can follow. NO PATCHES applies: observability first because it tells us whether replacement is necessary.

### 2.2 Poll-reconcile equivalents for the 4 non-B-NEW-36 schedules
B-NEW-36 has poll-reconcile because weekend-shutdown blast-radius is high (244 trades stuck + scanner stuck for entire weekend). The 4 others have lower individual blast radius:
- xstock-universe-cron: daily refresh; one missed day = stale universe for 1 day, recoverable
- formula-audit: daily integrity check; one missed day = no audit row, recoverable
- awareness-scheduler: hourly state log; one missed hour = no state row for 1h, recoverable
- feed-integrity: every 5 min; lots of missed fires but downstream auto-recovers

These don't need full poll-reconcile (each ride independent setInterval); fire-evidence verifier (§1.4) gives early-detection. If audit data shows these continue to fail and recovery isn't graceful, a follow-up batch adds poll-reconcile per-schedule.

### 2.3 Root-cause investigation of node-cron broken-state mechanism
Without a deterministic reproducer (we don't have one yet), upstream issue filing or library replacement is premature. Possible causes: node-cron 4.x async-handler edge case, process-state corruption from crash, PM2 graceful-restart preserving broken state. Deferred until either: (a) reproducer surfaces, OR (b) post-mitigation audit shows continued failures despite this batch's safety nets.

### 2.4 SchedulerRegistry / autonomy-scheduler (NOT node-cron-based)
Verified: `server/services/scheduler-registry.ts` + `server/services/autonomy-scheduler.ts` use `setInterval`, NOT node-cron. Resilient to BUG-2026-05-31-B class of failures. Out of scope. (Continued use of `transparency_log` table as fire-evidence is precedent for this batch's shared-audit-table pattern.)

---

## §3 Risk register

| Risk | Mitigation |
|---|---|
| Boot-time smoke test blocks server boot | Run as background `setTimeout(..., 0)` after server is listening; failures log + alert but don't `process.exit(1)`. Worst case: server boots without smoke test catching, +5min check + fire-evidence verifier catch within 20 min. |
| Per-fire audit-row writes add DB load | Quantify: 5 schedules × max 12 fires/hour (feed-integrity is the highest) = 60 writes/hour = 1 write per minute peak. Negligible vs current DB load (B74 batch-writer = ~20k rows/min). |
| System-alert spam if smoke test false-positives | Tune grace window per-schedule (intervalSeconds × 1.5 default; per-schedule override for noisy ones). System-alerts have deduplication via §10.5 dispatcher (one alert per scheduled fire). |
| Fire-evidence verifier itself uses node-cron → meta-failure | Use `setInterval`, NOT node-cron. Explicitly documented in code. |
| Changing `xstock-universe-cron`'s `discovery_runs` write breaks existing UI/queries | This batch ADDS audit-row to shared table; existing `discovery_runs` writes UNCHANGED. New table is additive, not replacement. |
| Existing `scheduled_tasks_audit` table (B-NEW-36-specific) vs new generic table | Open question Q1 — Langston decides whether to standardize or keep separate. |

---

## §4 Open questions for Langston

**Q1 — Single shared `scheduled_jobs_audit` table OR per-schedule tables?**
Pros of single: one query for "show me all fire-evidence in last N hours" surfaces silent failures across all schedules at once. Pros of per-schedule: existing `scheduled_tasks_audit` (B-NEW-36) + `discovery_runs` (xstock-universe) stay unchanged; less migration risk. I lean SINGLE — standardize on `scheduled_jobs_audit` with columns `(id, job_name, fired_at, status, duration_ms, meta jsonb)` + KEEP existing schedule-specific tables as additional rich-context writes. Migration: ADD new table; do NOT touch existing tables; each of 5 schedules writes to BOTH (existing rich + new generic). Acceptable double-write since both are post-fire async. **Your call.**

**Q2 — Smoke test cadence: boot + 5min only, OR also hourly periodic?**
Boot + 5min catches the deploy-state-arming case. Hourly periodic catches "schedule was armed but stopped firing mid-process-lifetime" (the May 29-31 case). The fire-evidence verifier (§1.4) covers this periodic case if we accept 15-min detection latency. I lean: smoke test = boot + 5min only; rely on fire-evidence verifier for periodic detection (15-min latency is fine for daily/hourly schedules; for feed-integrity-5min the verifier could run more often per-schedule). **Your call.**

**Q3 — Should formula-auto-audit's `/tmp/audit_report_YYYYMMDD.txt` files migrate to DB audit-row only, OR keep both?**
Current behavior: writes /tmp files only. This batch adds DB audit-row. Keep /tmp files (operator-readable summary)? Or migrate fully to DB + delete /tmp writes? I lean KEEP both — /tmp file is human-readable summary, DB audit-row is fire-evidence. No conflict. **Your call.**

**Q4 — Acceptable to defer poll-reconcile equivalents for the 4 non-B-NEW-36 schedules?**
Rationale in §2.2. Observability-first is more conservative + faster. If fire-evidence verifier post-deployment shows the 4 schedules still failing despite alerts, follow-up batch adds poll-reconcile. **Your call.**

**Q5 — Where does fire-evidence verifier live + how is it kicked off?**
Options: (a) NEW service module `server/services/cron-fire-evidence-verifier.ts` invoked from `server/services/autonomy-scheduler.ts` via existing setInterval registration; (b) standalone with its own `setInterval` in `server/index.ts` boot path; (c) hook into existing `scheduler-registry` as a registered task. I lean (a) — re-uses existing autonomy-scheduler infra which is already setInterval-based + has structured logging. **Your call.**

**Q6 — Standardize cron-registration logging across all 5 schedules + add cron-registry self-registration pattern at the same time, OR ship audit-row writes first + add registry/smoke test in a sub-batch?**
Single batch is cleaner (all observability layers land together); sub-batch is faster to first-value (audit-rows alone immediately give us evidence). I lean SINGLE BATCH — these all reinforce each other; partial coverage gives false confidence. **Your call.**

---

## §5 Sequencing + verification gates

### Step plan (autonomous CC+Langston iteration)
- **Step 1.a:** Architectural read of 5 schedule files + scheduler-registry (DONE inline above)
- **Step 1:** This scope doc → Langston ACK
- **Step 2:** Pre-audit (caller-surface for each of 5 schedules; identify any silent-fallback paths; verify next-fire-time computation works for each cron expr per node-cron 4.x docs)
- **Step 3:** Implementation chunks:
  - A. Migration — new `scheduled_jobs_audit` table (idempotent CREATE TABLE IF NOT EXISTS)
  - B. NEW `server/services/cron-registry.ts` — self-registration getter
  - C. NEW `server/services/cron-arm-logger.ts` — logCronArm helper
  - D. NEW `server/services/cron-fire-evidence-verifier.ts` + autonomy-scheduler wiring
  - E. NEW `server/services/cron-arm-smoke-test.ts` + boot + 5min wiring in server/index.ts
  - F. Wire audit-row writes + registration logs into each of 5 schedule sites
  - G. 5 new unit test files
  - H. tsc baseline-clean + vitest gate
- **Step 4:** Langston code review (embedded-diff dispatch per §6.5.0.a)
- **Step 5:** CI all-4-green
- **Step 6:** Staging deploy (migration + build + pm2 restart)
- **Step 7:** CC first-pass verification:
  - `[CRON-REGISTRATION]` log lines appear for all 5 schedules at boot
  - Boot smoke test logs `[CRON-ARM-SMOKE]` status=OK for all 5
  - 5-min smoke test re-fires + passes
  - First fire-evidence row appears in `scheduled_jobs_audit` for whichever schedule fires first post-deploy (likely feed-integrity at 5-min boundary)
  - Fire-evidence verifier first run logs all 5 schedules as healthy
- **Step 8:** Langston second-pass verification
- **Step 10:** Governance (SIM §9.10.c NEW node-cron observability section; BATCH_CATALOG + PHASE_HISTORY; CHANGES_AND_FIXES BUG-2026-05-31-B-update with the audit findings; RUNNING_ISSUES #164 CLOSED; ASSET_CLASS_ONBOARDING_WORKFLOW §4.26 reinforcement; MEMORY 3-way sync)
- **Step 11:** Completion report

### Verification gates
1. tsc baseline-clean (currently 494)
2. All new unit tests green
3. CI all-4-green
4. HTTP 200 post-deploy
5. All 5 schedules log `[CRON-REGISTRATION]` at boot with non-null next_fire timestamp
6. Boot smoke test passes for all 5
7. 5-min smoke test passes for all 5
8. Fire-evidence verifier reports all 5 healthy within first 20 min
9. First post-deploy fire writes audit-row (verified via psql)
10. Langston Step 8 ACK

---

## §6 Active-trading invariant

Per CLAUDE.md §5 #20: this batch is observability + safety-net layer only. ZERO active-trading impact. xStock VTS path continues normally. Crypto VTS path untouched.

---

*Reply ACK to proceed with Step 2 pre-audit + autonomous implementation, ACK-W-REVISIONS with specifics on the 6 open questions, or BLOCK with reasoning. Inbox path after SCP: `/home/langston/inbox/B-NEW-49/B_NEW_49_SCOPE.md`*
