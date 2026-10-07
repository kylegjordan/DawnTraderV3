# Release deploy 2026-10-07 — plan and record (deploy owner CC-B)

**Not before 2026-10-07T15:53Z** (`#1154`, Langston's 24 h rule after the 10-06 15:53Z paper reset). **Never 02:00-02:30Z** (the retention sweep runs at 02:15Z).
**Sha:** `0c8ef5da2582e03effd21070fb09b9ad5715ed77` — CI run `37566679783` success on that exact head. Staging is at `3576d39810fa7428501b68ce341ee46533c24935` (deploy B, 2026-10-06T15:45:04Z).
⛔ **Why this sha and not the branch head:** every commit from `b523c86bf` on carries batches still at Step 4 (2a0c cluster-bus, 3a feed-health, 3a1 venue-quiet, 2a0d duplicate scanner). The branch is linear, so the deploy stops one commit before them.

## What rides (runtime commits in `3576d3981..0c8ef5da2`)
| batch | owner | Step-4 approval | Step 7 after deploy |
|---|---|---|---|
| `B-ATR-BAD-PRINT` (row 2a, `#1153`) — `ef4c7c8be`…`66530fc48` | CC-B | Langston, at `66530fc48` | `PATTERN_ATR_DROPS` non-zero, `[PATTERN_EVAL_ERRORS]` 0 on the pool line; resolve `a24e39ed` citing the deployed sha (the drift job's own clear) |
| `B-ENGINE-STOP-DURATION-COLUMN` (row 2a0, `#1067`) — `77ee8cf2b`, `a0bddfea6`, `6546aa9af` | CC-B | Langston, at `6546aa9af` | `run_for_ms`/`ends_at` columns gone; an engine stop completes and clears the flag |
| `B-LIVE-BANNER-ACTIVE-HOTFIX` (row 2a0h, `#1160`) — `e2b5a84a4` | CC-B | Langston (hotfix gate), at `e2b5a84a4` | Claude-in-Chrome: the Live Trading banner reads STOPPED while paper runs; the Paper banner reads ACTIVE |
| `B-ENGINE-HEARTBEAT-DEAD-PATHS` (row 2a0b, `#1158`→`#521`) — `4a17ca8f4`, `cb246ba12`, `635e7132d` | CC-B | Langston r3, at `635e7132d` | ⛔ **HARD GATE:** the next 02:15Z sweep log shows the `cluster_bus_event` line AND every other registered table's line, zero `missing … data_lifecycle` lines — any miss ⇒ revert the registration the same day; zero heartbeat rows after deploy |
| `B-VTS-TELEMETRY-AGGREGATES` (row 4a) — `d4c688b88`, `03fc60c11`, `c8a35d6d9` | CC-C | Langston 01:05Z, at `c8a35d6d9` | CC-C |
| `B-SIZING-DEC-RESTORE` inc3 r9 — `cfc1d9c67`, `9c162aabc` | CC-C | Langston 01:08Z, at `cfc1d9c67` (`9c162aabc` comment-only) | CC-C |
| `B-EXPECTANCY-TUNING-ROWS-RETIRE` (row 4a2, `#1156`) — `2fee017cc` | CC-C | Langston 03:48Z, at `2fee017cc` (its condition `ff5a21d39` lands later: a test assertion + a migration header comment, SQL byte-identical — `db:migrate` keys `_migrations` by name and never compares a checksum) | CC-C; Langston's Step 8 reads count 0 / `roi_gating` 10 / clean boot |
*(Confirmed by ANALYST Claude 2026-10-07 ~05:35Z for the three CC-C rows.)*

## Migrations that apply (MANIFEST diff `3576d3981..0c8ef5da2`), in order
1. `2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql`
2. `2026-10-06-b-engine-stop-drop-time-limit-columns.sql`
3. `2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql`
4. `2026-10-07-b-expectancy-tuning-rows-retire.sql`

## Rollback order (direction-dependent — never by symmetry)
- `B-EXPECTANCY-TUNING-ROWS-RETIRE`: to roll the code back past `d4c688b88`, run `2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql` FIRST, then deploy the older sha (older code prefetches `expectancy_tuning` and refuses boot on 0 rows) — ANALYST Claude.
- `B-ENGINE-HEARTBEAT-DEAD-PATHS`: revert the sweep registration (code) FIRST or together with its rollback SQL (with the entry present and the seed gone, the sweep aborts) — its rollback header.
- The other two follow their own rollback headers.

## Procedure
1. Before: `git merge-base --is-ancestor` each batch's last sha above vs `0c8ef5da2` (exit 0 each); the staging worktree trap — copy the live phase9 file (`#686`) and `reports/` to `/home/deploy/preserved-<ts>` with `SHA256SUMS`, `git stash push -u`, deploy, `git stash pop`, `sha256sum -c`.
2. `dt-deploy 0c8ef5da2582e03effd21070fb09b9ad5715ed77 --by cc-b`.
3. Engine resume check; the boot warm-up lines; the 4 migrations in `_migrations`.
4. Each owner's Step 7 above. Drift rungs `a24e39ed` / `8a33a05c` clear through the drift job's own exit — read their state after, do not resolve by hand unless the job does not.

## Record (filled at deploy)
- deployed at: —
- ancestry exit codes: —
- migrations applied: —
- worktree preserved / restored: —
