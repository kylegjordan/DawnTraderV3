# B-NEW-47 COMPLETION REPORT — B75 tiered-storage sweep activation (RUNNING_ISSUES #161)

**Batch ID:** B-NEW-47 · **CLOSED:** 2026-06-01 · **Active trading:** OFF throughout (zero capital risk; force-sweep ran against the write-sealed May partition while June is the live one).
**Commit:** `e984aef` (code + migration) + governance commit (this turn). **Migration:** `2026-06-01-b-new-47-slice-threshold.sql`.
**CI:** run `26730239909` — all-4-green (Build, TypeScript Check, Test Suite, Docker Build). **Langston:** Step-2 + Step-4 APPROVED-W-REVISIONS (all folded) + clear-to-push CONFIRMED.

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Item | PREVIOUSLY (RI #161 / scope) | NOW | Reason |
|---|---|---|---|
| xStock ticker `hot_retention_days` | "shorten 30→**14**" (Kyle directive 2026-05-29) | **kept 30** | Ceiling math safe: saw-tooth peak ~85 GB ≪ 200 GB; monthly granularity makes 14-vs-30 immaterial for the big ticker table. Kyle authorized either pending math (#161); confirmed 30. |
| Cold rotator | "provision B2 creds → out of dry-run → schedule" | **stays dry-run, NOT scheduled** | B2 creds already present; `default_warm_retention_days=365` → nothing rotates for a year. Langston Q-D concur. |
| Single-object-per-month (Option 1) | scope v1 CC-lean | **Option 2 per-day slicing** | Probed Supabase global upload cap = 5 GB; largest compressed month ≈5–6 GB → single object BLOCKED. Locked in scope §8. |
| Whole-vs-slice threshold | code constant (Q-A lean) | **DB-governed `slice_threshold_hot_bytes`=3 GiB, fail-hard** | Langston Q-A: consistent with data_lifecycle config + Kyle DB-governed rule. |
| Partition granularity | (monthly, implicit) | **monthly retained** | Kyle 2026-06-01 considered + DECLINED monthly→daily re-partitioning (unnecessary given ceiling headroom). |

## Scope objectives — ALL MET

| # | Objective | Result |
|---|---|---|
| 1 | Streaming warm upload from file (bounded mem) | ✅ `uploadWarmFile` + TUS-from-fd; unit test 45 MiB → 8×6 MiB chunks, checksum round-trip |
| 2 | Streaming warm download to file (rehydrate + verify) | ✅ `downloadWarmFile`; on-disk second-read-pass checksum |
| 3 | Slice threshold + Supabase cap handling | ✅ DB-seeded 3 GiB, fail-hard; HARD_CAP 5 GB + pre-upload fail-fast |
| 4 | Sweep + rehydrate call-site changes | ✅ tsc 493 baseline unchanged; 16 tests green |
| 5 | Activate: cron + controlled first sweep + verify | ✅ ROOT crontab `15 2 * * *`; **force-sweep 31 GB → 30 slices, 0 fail, DB 57→26 GB** |
| 6 | Failure observability (don't activate a silent job) | ✅ failure→system-alert (critical on checksum mismatch) |
| 7 | CI green + governance + completion report | ✅ this turn |

## Verification (outcomes-based)

- **Local:** tsc `--noEmit` = 493 (B-NEW-50 baseline; 0 new errors in touched files). 16 new B-NEW-47 tests pass. tsx ESM runtime import of changed modules loads+constructs clean (no new npm dep → BUG-2026-06-01-A trap N/A). The 12 full-suite failures were PROVEN pre-existing via a git-stash run at clean HEAD (all local-no-Postgres artifacts; CI has the Postgres service container).
- **CI:** run `26730239909` all-4-green.
- **Deploy:** `e984aef` + `db:migrate` (1 migration applied: `slice_threshold_hot_bytes=3221225472`), build, pm2 restart, HTTP 200.
- **Force-sweep (the real validation):** attended detached run swept `xstock_spot_ticker_snap_2026_05` (31 GB) as **30 day-slices**, all download-verified to `active`, partition DROPped; plus 3 tiny April ticker partitions (whole path). `DONE — examined=4 dropped=4 failed=0 bytes_freed=33,584,873,472 (31.3 GB) bytes_archived=6,659,441,139 (6.2 GB)`. **DB 57 GB → 26 GB.** Retention temporarily lowered to 0.05 to make May eligible (June excluded — write-sealed), then RESTORED to 30.
- **Live-system health verified alongside:** Sunday `weekend_restart` fired 2026-06-01 00:00:00 UTC (trigger=cron, status=success, prewarm=success 28,678 buckets); 243 xStock trades open + **0 weekend_suspended**; scanner `SCAN_EVAL_DONE` every 30 s with `errors=0`; clean error scan since boot empty.

## Governance files changed
RUNNING_ISSUES (#161 CLOSED + #169–#172 OPEN), CHANGES_AND_FIXES (CLOSURE-2026-06-01 B-NEW-47), SYSTEM_IMPACT_MAP (B75 section corrected: streaming/slicing components, phantom-LIVE-cron + 500 MB/LIMIT-OFFSET/TUS staleness fixed), BATCH_CATALOG (B-NEW-47 row), PHASE_HISTORY (B-NEW-47 entry), MEMORY (3-way), this report. Scope/Pre-Audit/Change-List in `Claude Comms and Packages/`.

## Follow-ups spawned
- **RUNNING_ISSUES #169** — ctx-bridge-log-ttl buffered-upload latent OOM (deferred, table-size-bounded).
- **RUNNING_ISSUES #170** — day-grain >5 GB permanent-stall boundary (documented limit, not reachable now).
- **RUNNING_ISSUES #171** — corrupt month+day manifest coexistence = manual-intervention runbook.
- **RUNNING_ISSUES #172** — stale `equity_*` duplicate retention keys cleanup (harmless dead config).

## Asset-class onboarding learnings (§3.3)
B-NEW-47 is storage infra, not a Phase-24 asset-class batch. One generalizable learning reinforced: the BUG-2026-06-01-A discipline (no new npm dep here; only Node built-ins; tsx ESM runtime smoke before deploy) — green tsc/vitest/CI is necessary but not sufficient for runtime load. Also: the B75 storage scripts run under `tsx`, NOT the prod esbuild bundle, so they are isolated from the main-server ESM-bundle risk class.
