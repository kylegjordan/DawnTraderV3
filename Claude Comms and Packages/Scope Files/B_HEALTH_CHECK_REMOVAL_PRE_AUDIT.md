# B-HEALTH-CHECK-REMOVAL — PRE-IMPLEMENTATION AUDIT AND PLAN

change-class: non_architecture · the audit comes first; the plan falls out of it

## Audit
**A1 — what it does today (code, runtime, DB).** Hourly; `checkFailedTrades` throws `invalid input value for enum trading_mode` every run (24-31 lines a day in each of 14 rotated error logs 2026-09-19 → 10-02) and returns 0; it counts unresolved `error_logs` (`limit: 10`) and writes another `system_health` row when unhealthy — 6,578 rows since 2025-10-12, none resolved; `out.log` shows `Health check complete - Status: UNHEALTHY` every run.
**A2 — provenance.** See the scope: Replit-era, broken since 2025-10-25, never repaired.
**A3 — census and readers.** **Census (§9.5(a)/(a-ii), at `origin/migration/aws-supabase`, tests excluded):** code references to the task — `server/index.ts:686` (import) and `:737-746` (registration); its NAME in two task lists — `server/routes.ts:15962` (scheduler-cadence diagnostic) and `server/storage.ts:2135-2136` (`getSystemSchedulerLogs`); its file in `.tsc-baseline.json:576` (the grandfathered TS2345) and in `scripts/classify-baseline.mjs:145`'s file-classifier regex. **No test references it** (grep over `server/tests`, `server/__tests__`, `tests`: none). `routes.ts:15139`'s `GET /system/health` is a DIFFERENT, unrelated endpoint and stays. **State it writes:** `error_logs` rows with `error_type='system_health'` (6,578, none resolved). **Readers of that state:** `diagnostics/metrics.ts:185-190` counts unresolved last-hour `error_logs` into an `errorRate` (`analyzer.ts:111` flags at >10) — removing the writer LOWERS that rate toward truth and breaks nothing; the UI error-log lists filter on a user id these rows do not carry (`routes.ts:15535`); `cle-orchestrator.ts:581-586` keeps only types containing 'error'. The scheduler also writes one `ai_transparency_log` row per run under the task's name — read only by the two name lists above, which drop the name in the same change.
**A4 — SIM / System Manual.** `SYSTEM_MANUAL.md` "Registered Tasks (13 total)" lists it as task 4 — updated. `SYSTEM_IMPACT_MAP.md` §9.8 Scheduler Registry does not list tasks — a removal note and the `#1039` pointer are added.
**A5 — ledger (§9.5(b-ii)).** `#1147` is the only entry about this task; no decision kept it on purpose.
**A6 — local test run.** `server/tests/unit`: the same 7 files fail with and without this change (they need a local PostgreSQL; `ECONNREFUSED :5432`) — a control, not a result; CI runs them against its database.

## Plan (each item ← its finding)
1. Delete the task file; archive a copy ← A1, A2.
2. Remove the import and the registration block in `server/index.ts` ← A3.
3. Drop the name from `routes.ts:15962` and `storage.ts:2136` ← A3 (otherwise they would report a missing task).
4. `node scripts/check-tsc-baseline.mjs --sync --batch B-HEALTH-CHECK-REMOVAL`; drop the regex token ← A3.
5. `DELETED_COMPONENTS_LOG.md`, the `SYSTEM_MANUAL.md` task table, `SYSTEM_IMPACT_MAP.md` §9.8 ← A4.
6. Ships in deploy B; verify per the scope's objectives ← A1.

No `UNAUDITED` items.
