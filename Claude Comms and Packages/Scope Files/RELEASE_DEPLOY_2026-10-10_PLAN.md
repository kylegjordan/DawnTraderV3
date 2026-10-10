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
