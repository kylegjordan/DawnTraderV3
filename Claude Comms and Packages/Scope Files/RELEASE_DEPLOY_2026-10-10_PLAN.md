# Release deploy 2026-10-10 — range, owners, and the review check (CC-C, on Kyle's instruction)

**Kyle (2026-10-10):** *"Yes, run the deploy once Langston confirms the reviews."* CC-B, who normally runs the release, and CC-A are not running. CC-C deploys only after Langston confirms that every batch in the range is Step-4 approved at the commit being shipped (`#988`: a deploy declares its range and owners).

**Range:** staging `0c8ef5da2582e03effd21070fb09b9ad5715ed77` (deployed 2026-10-07T15:56:00Z) → branch head `251dbc4faa7099a38953e7d9f9ff04de56826781` (or the head at deploy time, if only governance commits have landed since; re-checked before running). Runtime paths (`server shared client drizzle package.json scripts/governance-checker`): 61 files, +2,697 / −1,898.

| batch | owner | runtime commits in range | latest commit on the batch | review status to confirm |
|---|---|---|---|---|
| B-PRICE-FEED-TRUTH I3 (`#1047`) | CC-C | `d77474310`, `f4512ad0d` | `f4512ad0d` | Step 4 approved (C1 folded) |
| B-PRICE-FEED-TRUTH I2 | CC-C | `40da5121b`, `2063f0d4f` | `2063f0d4f` | Step 4 approved 2026-10-07 13:42Z; conditions folded at `2063f0d4f` |
| B-LOSS-WINDOW-OPERATOR-CLOSES (`#1154`, stage 0) | CC-C | `78d85f5d6`, `b6907db69` | `3cb978f0e` (approval recorded) | Step 4 approved |
| B-VENUE-QUIET-ALERTING (row 3a1) | CC-B | `ae6ae8ff8`, `ee4920646`, `b70ab5975` | `a6e2d8125` (Step-4 record) | ⚠️ confirm the final Step-4 verdict |
| B-FEED-HEALTH-GRADE-ARM (row 3a) | CC-B | `3a549e3a9` | `785066258` ("Step-4: change list") | ⚠️ **no approval recorded in the log — confirm or hold** |
| B-ROOT-DUPLICATE-SCANNER-RETIRE | CC-B | `5674c012b`, `035d0f7e5`, `91407e6c9` | `91407e6c9` (Step-4 record fix) | ⚠️ confirm |
| B-CLUSTER-BUS-PERSIST-DISPOSITION | CC-B | `b523c86bf`, `9ab39a45a` | `9ab39a45a` (Step-4 conditions) | ⚠️ confirm |
| B-CENSUS-OWNERLESS-TRIAGE | CC-A | `82775ef9f` | `86423cee4` CLOSED | closed (Step 11 confirmed) |
| B-CENSUS-OWNERLESS-REMAINDER | CC-A | `9dbc86c47`, `d728f903d`, `bb4f6c708` | `8a183c13b` CLOSED | closed |
| B-LEDGER-TAIL-DISPOSITION | CC-A | `7e6e78b89`, `6a95458d8` | `62a874b1c` CLOSED | closed |
| B-EXPECTANCY-TUNING-ROWS-RETIRE | CC-C | `ff5a21d39` (migration header comment only; SQL byte-identical, already applied 10-07) | CLOSED | closed |

**Migrations in range** (`dt-deploy` runs `db:migrate` in-chain): `2026-10-07-b-cluster-bus-persist-remove.sql` (drops `cluster_bus_event`, its enum and indexes; rollback beside it) · `2026-10-07-b-venue-quiet-alerting.sql` (rollback beside it) · `2026-10-07-b-expectancy-tuning-rows-retire.sql` MODIFIED (header comment only; already in the ledger, so not re-run) · `MANIFEST.txt`.

**Restart consequences, checked:** the kill switch's loss window is anchored by this release's own Stage 0 fix (operator closes stay out after a restart). No observation window is split by it: row 2's window ended at day 7, and the frozen corpus is on disk. Every in-memory rolling window re-warms (the `workflow-06` warning): Step 7 readings wait out their warm-up.

**Rollback:** deploy `0c8ef5da2582e03effd21070fb09b9ad5715ed77` by the same path, running the two new rollback files first, in reverse order.

**Not in range as code:** `B-ATR-BAD-PRINT` (`#1153`, CC-B) is already live in `0c8ef5da2` (`c24726df3`, deployed 2026-10-07 15:56Z). Only its Step-7 record (`2cc6fda88`) is in range; its open item is CC-B's governance (alert `3af25ef9`).

## ✅ DEPLOYED 2026-10-10T11:59:29Z — `ad01f5339b558ee968a7686d719e98b66e5fd01d` (`dt-deploy --by cc-c`)
- **Gate:** Langston confirmed all four CC-B batches 11:57Z (VENUE-QUIET r3 PROCEED on record; FEED-HEALTH-GRADE-ARM reviewed and APPROVED this turn at `3a549e3a9`; ROOT-DUPLICATE-SCANNER-RETIRE at `91407e6c9`; CLUSTER-BUS-PERSIST at `9ab39a45a`). He re-derived the range (61 files, 22 runtime commits, all attributed). The head `ad01f5339` adds zero runtime files over `251dbc4fa`. CI run `38049753797` on the head: Build, Test Suite, TypeScript Check (baseline gate), Docker Build all `success`.
- **Record:** `restart_time` 631; migrations `2026-10-07-b-cluster-bus-persist-remove.sql` and `2026-10-07-b-venue-quiet-alerting.sql` applied 11:59:18Z (`migrate_ms` 983); engine resumed and identity asserted; check-failure window 11 s.
- **Staging worktree, handled without loss (the 10-06 procedure):** the live `bridge/canonical/phase9_predictive-learning.json` (`#686`) and the 5 `reports/CSAV_Report_*.json` were copied to `/home/deploy/preserved-R1010-20261010T115837Z` with `SHA256SUMS`, then `git stash push -u`, the deploy, `git stash pop`. After the pop: phase9 byte-identical, and all 5 reports byte-identical.
- **First reads (CC-C):** `cluster_bus_event` is gone (`to_regclass` null) · kill switch not tripped (paper, live) · I2 live: `[I2][PriceCache][VENUE_READY] … waitedMs=2000 skippedPasses=1` at 11:59:24Z, then `WRITE_KEYS … requested=4 written=4 phantom=0` · **8 `TEC_CACHE_MISS_FATAL` lines, all in the one second 11:59:23Z, on 4 crypto positions.** This is the known boot race (row 172 `B-TEC-PRIME-BOOT-RACE`, Infra); the 10-07 deploy showed 12 the same way. 0 "Error checking position" lines after 11:59:30Z.
- **Owners' Step 7 owed:** CC-B for the four batches above (note Langston's re-point of the FEED-HEALTH read to a non-healthy→healthy transition); CC-C for I3, I2 and Stage 0. The drift rungs (`a24e39ed`, `8a33a05c`, `4f9f3c27`, `d01742a1`) should clear on the next drift run; still open after that = `#1021`.
- **CC-C Step 7, first reads (12:05Z):** new process `pm_uptime` 2026-10-10T11:59:18.959Z.
  - **I3 (P5, C2):** `[KrakenWS] Error parsing message` = **0** in `error.log` since 11:59:18Z, against **6** earlier today before the deploy (last at 10:33:16Z; positive control for the phrase). The denominator so far is **1** `Sub OK: instrument (all pairs)` (11:59:27Z, the new process's boot subscribe) — the event that threw under the old code. C2 asks for ≥ 8 in one window, so the read **continues** as subscribe batches accrue.
  - **I2 (P7):** `VENUE_READY waitedMs=2000 skippedPasses=1`; `WRITE_KEYS … phantom=0` on every line read. The full P7 (skip rate by bucket composition against Langston's baseline) needs a WEEKDAY window ⇒ read Monday 10-12.
  - **Stage 0 (`B-LOSS-WINDOW-OPERATOR-CLOSES`, obj 5):** NOT DISCRIMINATING TODAY. With no operator re-anchor in the last 24 h, the window is `max(now − 24h, session start 11:59:18Z)` under both the old and new rule. It is exercised at the pre-sprint stage-5 reset (a restart within 24 h of an operator re-anchor), and the Step-7 read is placed there.

## ⚠️ TWO LANGSTON VERDICTS ON THE SAME GATE — RECORDED, RECONCILIATION ASKED (12:10Z)
- **11:57:24Z, Discord message `1558448355061792849` — the verdict the deploy acted on:** *"Step 4 CONFIRMED on all four. Deploy can run. Do not revert anything."* That run reviewed all four. VENUE-QUIET: r3 PROCEED on record. **FEED-HEALTH-GRADE-ARM: "you were right, no verdict existed. I reviewed it this turn: APPROVED at `3a549e3a9`"**, with removals census-verified, the 1,088-row premise measured, and the weekend concern dissolved on citation. ROOT-DUPLICATE: "confirmed at `91407e6c9`" (condition 1 met in the shipped code). **CLUSTER-BUS: "APPROVED at `9ab39a45a`"**, with the drop measured safe (only column on the enum; drop table before drop type; zero FKs and zero dependent views). He set the board's Review = Approved on FEED-HEALTH and ROOT-DUPLICATE.
- **12:02:51Z, message `1558449727778070579` — a SEPARATE invocation, answering my earlier queued row-64 message:** *"I CANNOT CONFIRM. HOLD."* It read only the change lists at the ref, where the 11:57 verdicts had not yet been written, and found no recorded discharge for three of the four. **Langston is stateless per invoke, so this run could not see the 11:57 run.** The deploy was already live (11:59:29Z).
- **The root cause is a record gap, not a review gap:** the 11:57 approvals existed only in the channel. They are now written here, and the relevant lines are owed into the three change lists (CC-B's files; this is the repo copy of his verdicts). Reconciliation is dispatched to Langston. If he withdraws any approval on substance, the rollback is ready: deploy `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, after the two new rollback files in reverse order.
