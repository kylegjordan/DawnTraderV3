# B-HEALTH-CHECK-REMOVAL — SCOPE

change-class: non_architecture

**Issue:** `#1147` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 51a · **Owner:** CC-B (NEW Claude) · **Directed by:** Kyle, 2026-10-02 (~22:50Z): *"For the health check, let's shut down the alert or whatever it is pinging. Let's disable it, delete it. If it can be done quickly, let's remove it ... we need to document firmly that it needs to be deprecated and deleted."* · **Rides:** deploy B (no migration).

## Objectives
1. **Delete the System Health Check scheduled task** (`server/services/system-health-check-task.ts`) and its registration — rule 18 disposition (a), delete on the spot. *Verify:* the file is gone at the ref; after deploy B no `[SystemHealth] Starting system health check` line appears in `out.log` across two hourly boundaries, and the count of `error_logs` rows with `error_type='system_health'` is unchanged one hour after B's restart.
2. **Remove its name from the two scheduler-task lists** (`routes.ts:15962`, `storage.ts:2136`) so nothing reports it as a missing or stalled task. *Verify:* the lists at the ref name three tasks.
3. **Clear its grandfathered type error** from `.tsc-baseline.json` via the gate's own `--sync --batch` path, and its token from `classify-baseline.mjs`. *Verify:* the gate reads 338 against a baseline of 338, one file dropped.
4. **Record the deletion** in `DELETED_COMPONENTS_LOG.md` with an archive copy. *Verify:* the entry and `_archive/deleted-code/system-health-check-task.ts.removed` are present.

## Provenance (§2 1.b, TIER 1 — this batch removes behaviour)
- **Introduced** `1590221f7` (2025-10-09, Replit): *"Add AI transparency panel and automated scheduler tasks ... Integrates four new autonomous scheduler tasks (Screener Recalibration, Market Scan, AI Summary, System Health Check) into the `SchedulerRegistry`."*
- **Broken** 2025-10-25 when `getTrades` moved from a user id to a mode (`f935a2ed3` *"Remove user ID from many database tables and service calls"*, `530b0d208`); the caller was never updated and its TS2345 was grandfathered.
- **Disposition: (4) connected but should be REMOVED.** It measures nothing about today's system: the failed-trades leg throws every hour and returns 0; the `trades` table it reads is empty (0 rows; control `closed_trades` 930); it is permanently UNHEALTHY because it counts its own unresolved rows; nothing acts on its verdict. Investigation and a fresh reader's review: `RUNNING_ISSUES` `#1147`.

## Blast radius
**Census (§9.5(a)/(a-ii), at `origin/migration/aws-supabase`, tests excluded):** code references to the task — `server/index.ts:686` (import) and `:737-746` (registration); its NAME in two task lists — `server/routes.ts:15962` (scheduler-cadence diagnostic) and `server/storage.ts:2135-2136` (`getSystemSchedulerLogs`); its file in `.tsc-baseline.json:576` (the grandfathered TS2345) and in `scripts/classify-baseline.mjs:145`'s file-classifier regex. **No test references it** (grep over `server/tests`, `server/__tests__`, `tests`: none). `routes.ts:15139`'s `GET /system/health` is a DIFFERENT, unrelated endpoint and stays. **State it writes:** `error_logs` rows with `error_type='system_health'` (6,578, none resolved). **Readers of that state:** `diagnostics/metrics.ts:185-190` counts unresolved last-hour `error_logs` into an `errorRate` (`analyzer.ts:111` flags at >10) — removing the writer LOWERS that rate toward truth and breaks nothing; the UI error-log lists filter on a user id these rows do not carry (`routes.ts:15535`); `cle-orchestrator.ts:581-586` keeps only types containing 'error'. The scheduler also writes one `ai_transparency_log` row per run under the task's name — read only by the two name lists above, which drop the name in the same change.

## Out of scope
- **The 6,578 existing `system_health` rows** stay as history: inert once their writer is gone. Deleting them is a data decision, not needed for this removal.
- **The scheduler's double first run** is `#1039` (`B-SCHEDULER-FIRST-TICK`, row 73, Infra Claude), not this batch.
