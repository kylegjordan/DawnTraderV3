# B-DB-SIZE-RELIEF — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · **Owner:** OLD Claude (CC-A) · **Scope:** `B_DB_SIZE_RELIEF_SCOPE.md` r3, Step 1 PROCEED by Langston at `3bbc6b57e` (Discord `1568403374984929331`) with three carry-ins, all treated below · **Kyle:** KD-60 (2026-11-06) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` stage 00, order 5c.
**Drafted 2026-11-08 ~00:30-01:30Z while `B-DB-POOL-GUARD` P5's deploy waits on another batch's Step 4.** Nothing here runs before its place in the queue; code is written after this document clears.

---

## 0. PREVIOUSLY STATED vs NOW (every figure re-derived on staging 2026-11-08 00:27Z, or at `origin/migration/aws-supabase`)
- **PREVIOUSLY STATED:** live 140,345 MiB (11-06 ~18Z), 141,715 MiB (11-06 22:51Z). **NOW:** **140,029 MiB** (`pg_database_size`, 2026-11-08 00:27:18Z). **REASON:** the 11-07 02:15Z sweep freed 3,756,122,112 B (`b75-retention.log`, run `d21c0130`), and the database grows between sweeps.
- **PREVIOUSLY STATED:** the oldest 15 dailies of `signal_eval_archive` are `_2026_10_07 … _10_21` = 20,385 MiB. **NOW:** `_2026_10_08 … _10_22` = **20,328 MiB**. **REASON:** the 11-07 sweep dropped `_10_07`; the window moves one day per night.
- **PREVIOUSLY STATED:** the bars' hot windows are 365 (`xstock_spot_ohlc_1m`, `crypto_spot_ohlc_1m`, `xstock_perp_ohlc_1m`). **NOW:** **`crypto_spot_ohlc_1m` is 145** (`updated_by 'B-DISK-HEADROOM OBJ-3 stage A'`, 2026-11-07 18:18:48Z). **REASON:** Infra Claude's row 6 started its staged cut. Not this batch's; it matters for the sweep's load (F2).
- **PREVIOUSLY STATED:** October monthlies — provenance 6,346 · pair_scan 6,231 · `crypto_spot_ticker_snap` 3,001 · `xstock_perp_ticker_snap` 1,883 · macro 20 · exit 13 MiB. **NOW:** 6,346 · 6,231 · **3,000** · **1,882** · 20 · **12** MiB. **REASON:** rounding of `pg_total_relation_size` / 1,048,576; no material change. November so far: 1,401 · 1,287 · 539 · 424 · 5 · 3 MiB.
- **PREVIOUSLY STATED:** `computeDataArchiveStatus` at `drift-dashboard-aggregator.ts:800`, `WINDOW_TO_MS` at `:1256`. **NOW:** **`:814`** and **`:1325`**. **REASON:** `B-DB-POOL-GUARD` P5 (`2de102383` … `2a25fcfb1`) edited the file above them.

---

# PART A — THE AUDIT

## A.1 The six sources, and which I read
| # | source | read | where it lands |
|---|---|---|---|
| 1 | CODE at the ref | `daily-partition-cutover.ts` (whole), `b74-create-daily-partitions.ts:40-140`, `b70-create-monthly-partitions.ts:34-41/:85-120`, `b74-create-monthly-partitions.ts:34-60/:83-92`, `b-storage-archival-health.ts:262-300`, `passive-archive-bootstrap.ts:44-54/:80-110`, `b75-retention-sweep.ts:148-162/:235-241` + the run-lock and per-partition loop, the Wave-D cutover migration, `drift-dashboard-aggregator.ts:776-900/:1325`, `analytics.tsx:2034-2159`, `b5-w20c-provenance-replay.ts:18-52/:128-190`, `b_xstock_fee_contract_deploy_baselines.sql:1-110`, `b4-regime-parity.ts:107`, `b5-w2a-geometry-sweep.ts:43` | F1-F8 |
| 2 | RUNTIME + DATABASE | `module_constants` `data_lifecycle` (all 35 keys); the partition census; per-child heap/total bytes and `count(*)` of every `_2026_12`; `b75-retention.log` (11-07 run, per-partition timings); root crontab | F1, F2, F4 |
| 3 | `SYSTEM_IMPACT_MAP.md` | data-archive component `:2255`, SIM #17 `:2262`, P7 `:2399`, the registry entry `:2511` | F9 |
| 4 | `SYSTEM_MANUAL.md` | "Retention + partition crons" `:12125`, "Per-table hot retention" `:12257` | F9 (a governance gap) |
| 5 | LEDGER + REPORTS | `RUNNING_ISSUES` `#688` (`:4042`); `PRE_LIVE_SPRINT.md:232`; `STORAGE_POLICY.md:35/:42/:45-47/:177-179`; the KD-32 pack §5 (corrected `48b6a80d5`) | F10 |
| 6 | `bridge/canonical/` | searched for the archive tables, `hot_retention`, `data_lifecycle`, "monthly partition": **no coverage** (control: `regime` returns 16 and 15 hits in two corpus files) | F11 |

## A.2 Findings

**F1 — The retention keys this batch touches, as they stand.** `signal_eval_archive` 30 (`p19-b-perpfeed-obj7a-step2-final-30`, 2026-08-18); `pair_scan_archive`, `signal_eval_provenance`, `exit_decision_archive`, `macro_feed_archive` 30 (`cc-analyst-c5ad11d1-restore-30`, 2026-08-19, by hand); `crypto_spot_ticker_snap` 30 (`b75-data-lifecycle` seed, 2026-05-18); `xstock_perp_ticker_snap` 30 (`b79.0e-rename` seed, 2026-05-10). None of the five hand-set or seeded values has a migration record for its live value — the scope's reaffirm list is confirmed exactly.

**F2 — The sweep: schedule, speed, and the missing-key abort.**
- Root crontab line 6: `15 2 * * *` → `b75-retention-sweep.ts`, logging to `b75-retention.log`. One run per night behind an O_EXCL run-lock (`:1234-1271`).
- 11-07 run: **821,487 ms** total, 5 partitions dropped, 3.76 GB freed. A `signal_eval_archive` daily took **175-252 s** each (10-02 … 10-07: 251,824 / 188,880 / 175,252 / 239,599 / 249,405 / 243,092 ms), whole-mode, 1.0-1.6 GB hot → 38-50 MB warm.
- **No per-run cap:** a grep of the sweep for `max_partitions|deadline|time budget|per run|MAX_` returns only unrelated `max_ts` hits (the instrument works). So OBJ-1's backlog (16 dailies on the first night after a 15-day key lands) is ~16 × ~4 min ≈ **one extra hour in one run**, not "several nights". The scope's "however many nightly passes" stays as the verification wording, because a failure or the lock can still split it.
- Order: the six B74 tables first, then the six B70 tables (`PARTITIONED_TABLES = [...B74_TABLES, ...B70_TABLES]`, `:162`).
- **The load that collides:** Infra Claude's `crypto_spot_ohlc_1m` cut to 145 days (F1, 2026-11-07 18:18Z) gives the sweep a monthly backlog of its own (the months older than ~2026-06-15). Those are B74 and run FIRST.
- `reqNum` (`:235-241`) THROWS on a missing or invalid key, and the comment at `:148-150` records that a missing B70 key fails the whole night — so any rollback restores keys before code.

**F3 — The cutover registry: five consumers, enumerated repo-wide before tracing (carry-in 1).** `git grep DAILY_PARTITION_CUTOVERS|cutoverForTable|daily-partition-cutover` over `server`, `scripts`, `shared` (tests excluded):
| consumer | what it does with a new entry | evidence |
|---|---|---|
| `b74-create-daily-partitions.ts:84-85` | creates `…_YYYY_MM_DD` children from `max(today, cutover)` for 14 days ahead, any table, bare-date bounds; children inherit the parent's partitioned indexes | `:40-140` |
| `b74-create-monthly-partitions.ts:92` | skips any month at/after the cutover for its `SIX_TABLES` — which include **`xstock_perp_ticker_snap` and `crypto_spot_ticker_snap`** (the guard those two rely on) | `:34-60/:83-92` |
| `b70-create-monthly-partitions.ts:95/:113` | skips the current month and every forward month at/after the cutover for its six B70 tables (incl. `pair_scan_archive`, `signal_eval_provenance`, `exit_decision_archive`, `macro_feed_archive`) | `:34-41/:85-120` |
| `b-storage-archival-health.ts:270-300` | from each table's cutover onward, checks its daily runway and fires if none exists — **six new runway checks** start at the cutover: `signal_eval_provenance`, `pair_scan_archive`, `crypto_spot_ticker_snap`, `xstock_perp_ticker_snap`, `macro_feed_archive`, `exit_decision_archive` | `:262-300` |
| `passive-archive-bootstrap.ts:92` | boot self-heal: for a table in `ARCHIVE_TABLES` whose current month is daily, creates today's daily child instead of a monthly one. `ARCHIVE_TABLES` (`:44-54`) holds **two of the six** (the two ticker snaps); the four B70 tables are not bootstrap-covered — the same as `signal_eval_archive` today, whose coverage is the b70 creator plus the daily creator | `:44-54/:80-110` |
**The sweep is NOT a sixth consumer:** it classifies a child daily or monthly by NAME shape (daily first, `:291-305`), which `signal_eval_archive`'s daily era has exercised since 2026-09-01.
**Per-hop census (§9.5(a)):** partition CREATORS — the three creators above, the bootstrap, migrations; partition DELETERS — the sweep (drop only after verify) and cutover migrations (empty future monthlies only); SCHEDULERS — crons for the creators (b70 `30 2 28 * *`, the daily creator `0 1 * * *` per the Wave-D header) and the sweep (`15 2 * * *`). No second deleter of a non-empty partition exists.

**F4 — Every December monthly of the six is empty by the scope's test.** `pg_relation_size` = 0 and `count(*)` = 0 for all six `_2026_12` children; total bytes 16,384-57,344 (indexes only). So a cutover at **2026-12-01** is available if this deploys in November. Each table also holds pre-created future monthlies through `_2027_10` (13 children: `_2026_10` … `_2027_10`), so the cutover drops **11 per table, 66 in all**.

**F5 — The precedent migration's shape** (`2026-07-08-b-storage-harden-wave-d-xstock-ticker-daily-cutover.sql`): one transaction; for each monthly child at/after the cutover, `count(*)` > 0 ⇒ `RAISE EXCEPTION`, else DETACH + DROP; then pre-create the first 16 dailies from the cutover. **It has no rollback file.** This batch adopts the shape with the scope's stricter guard (heap = 0 AND a `LIMIT 1` probe), and adds a rollback that is honest about its limit (P4).

**F6 — The 15-day floor, re-derived after the stage-attrition deletion.** Every code file naming `signal_eval_archive` (24 files) was classified. **No live server reader remains except the Drift Dashboard's data-archive panel**, now on `diagDb`. The others are comments, the id allocator, the export tool's list, the sweep's own lists, an analysis script's table list, and by-hand scripts: `b4-regime-parity.ts` (`LIVE_WINDOW_DAYS = 14`, `:107`), `b5-w2a-geometry-sweep.ts` (`WINDOW_DAYS` default 14, `:43`), the replay script (era), the fee-contract SQL (14 days before deploy), the `b-xstock-calib-*` scripts, and the two `b79-0f` collision scripts (historical). Control: the archiver's `const TABLE = 'signal_eval_archive'` (`signal-eval-archiver.ts:34`) is found. **15 is a measured floor with one day of slack.**

**F7 — OBJ-2's panel.** `computeDataArchiveStatus` (`:814`) counts five tables (`pair_scan_archive`, `signal_eval_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance`) with `captured_at >= windowStart` against HOT partitions. At `rolling_30d` after OBJ-1 the `signal_eval_archive` row would show 15 days under a 30-day label; the other four stay at 30. The client renders `rowsInWindow` per table and a QUERY TIMEOUT badge on `timedOut` (`analytics.tsx:2034-2039`, `:2153-2159`), so there is already a per-row badge slot. Reading warm for the older days would mean downloading `jsonl.gz` objects per refresh (30 s refetch) — rejected on cost.

**F8 — OBJ-3's two readers.**
- Replay script: `ERA_START` default `2026-06-08T00:00:00Z` (`:46`). C1 coverage is a base-driven LEFT JOIN over `signal_eval_archive` (`:133-139`); the fired and no-fire samples are INNER joins from `signal_eval_provenance` to the archive on `(id, captured_at)` (`:159-186`). **New since the scope:** after OBJ-1 the two joined tables have DIFFERENT hot horizons (15 vs 30), so the readable window is the SHORTER one. The samples lose provenance rows 15-30 days old silently, and C1 counts base only over 15.
- Fee-contract SQL: Arm B reads the 14 days before `deploy_at` (`:63-82`), inside 15 if run at deploy time as its own header says. Its `switch_on_shadow_evidence` ranges start at `f8870022f_at` = 2026-09-04 (`:16`, `:36`), and that table's hot window is 90 days, so the start leaves hot on ~2026-12-03. The horizon print covers both.

**F9 — The maps.**
- SIM `:2255` still reads "5 tables + 48 monthly partitions" (stale since the Wave-D era).
- SIM #17 `:2262` still reads "0 rows (pre-flip)" for `switch_on_shadow_evidence`, against 3,303,140 rows (carry-in 3; corrected unconditionally).
- The registry entry `:2511` lists the original tables.
- **System Manual "Per-table hot retention" (`:12257`) is stale AND silent:** it uses the pre-rename `equity_*` names, lists no B70 table at all, and shows 365 for `crypto_spot_ohlc_1m`, which is 145 since 11-07. **A governance gap, flagged.** This batch corrects the rows it changes and adds the B70 tables; the bar rows are Infra Claude's row 6, told once.
- "Retention + partition crons" (`:12125`) names daily partitioning for `xstock_spot_ticker_snap` only.

**F10 — The ledger (§9.5(b-ii)).** `#688` OPEN (`RUNNING_ISSUES.md:4042`) homes the monthly trap on `B-DAILY-CUTOVER-SWEEP` (CC-C), placed only in the after-live list (`PRE_LIVE_SPRINT.md:232`). `STORAGE_POLICY.md:42/:45-47/:177-179` carry the 30-day values and `:42` records the two ticker snaps as monthly. **No decision was found that this batch would contradict:** KD-60 approved A1 + A2, and #688 is absorbed with CC-C told.

**F11 — Provenance.** `bridge/canonical/` has no coverage of the archive tables (control positive), so their intent comes from the batch records the scope already cites (Wave C `0c22d0293`, Wave D, P19-B-PERPFEED `af60c62f6` / `35be745ac`, `#688`). **That absence is itself the finding:** the retention design is entirely post-governance.

---

# PART B — THE IMPLEMENTATION PLAN (each item points at its finding)

**P1 — OBJ-1 migration: `signal_eval_archive.hot_retention_days` 30 → 15, every touched key reaffirmed.** ← F1, F6.
- `drizzle/migrations/2026-11-XX-b-db-size-relief-retention.sql` + its `-rollback.sql`, both `git add -f`; the forward file in `MANIFEST.txt`.
- The forward migration UPSERTs the seven keys at their stated values (15; and 30 for `pair_scan_archive`, `signal_eval_provenance`, `exit_decision_archive`, `macro_feed_archive`, `crypto_spot_ticker_snap`, `xstock_perp_ticker_snap`) with `updated_by = 'b-db-size-relief-obj1'`.
- The rollback writes `signal_eval_archive` back to 30 and leaves the six at 30. A rollback NEVER deletes a key (F2: a missing key fails the whole night).

**P2 — OBJ-1 deploy timing.** ← F2. ⛔ **SUPERSEDED by r2 (C-3): the hold is dropped to a note.**
- The 15-day key lands only AFTER Infra Claude's `crypto_spot_ohlc_1m` stage-A backlog has drained, read in `b75-retention.log` as a run whose `DONE` line shows no remaining B74 bar months.
- This keeps one night from carrying both backlogs. Its cost is a delay of a night or two, against ~20 GB. Infra Claude is told once.

**P3 — OBJ-4 registry: six entries APPENDED after the existing six in `DAILY_PARTITION_CUTOVERS` (r3, C-5(i)), `cutoverDate '2026-12-01'`** (the first clean boundary if this deploys in November; else `2027-01-01`). ← F3, F4. Each entry's comment names this batch. No consumer needs a code change (F3); the archival-health runway checks for the six begin on the cutover date.

**P4 — OBJ-4 cutover migration.** ← F4, F5. ⛔ **Its rollback and its locking are SUPERSEDED by r2 (C-1, C-2).**
- One transaction, the Wave-D shape, for the six tables.
- **Guard per child, the scope's predicate:** `pg_relation_size(child) = 0` AND `NOT EXISTS (SELECT 1 FROM child LIMIT 1)`, else `RAISE EXCEPTION` naming the child.
- For each monthly child at/after the cutover: DETACH + DROP — **the count the catalog lists** (66 for a 2026-12-01 cutover; 60 for 2027-01-01, `_2027_01 … _2027_10`). The migration NOTICEs each and raises if the dropped count differs from what it listed.
- Then pre-create the dailies `cutover … cutover+15` per table.
- **Rollback:** valid ONLY BEFORE the cutover date. It drops the pre-created dailies if each is empty by the same predicate, and recreates the monthly children `_2026_12 … _2027_10` with the monthly creator's bare-date bounds. After the cutover date the dailies hold rows, so the rollback refuses rather than move data. Stated in its header.
- The registry entries (P3) ship in the SAME deploy, so the monthly creators never re-create what P4 dropped (the Wave-D deploy-order rule).

**P5 — OBJ-2: the data-archive panel states its hot horizon.** ← F7.
- Server: each table's response row gains `hotHorizonDays` (read once per call from `data_lifecycle`; a missing key renders unknown, never a default) and `windowPartial` (`windowMs > hotHorizonDays × 86,400,000`).
- Client (`analytics.tsx`, beside the QUERY TIMEOUT badge): a `PARTIAL — hot holds N d` badge on a partial row.
- Local to `computeDataArchiveStatus`; `WINDOW_TO_MS` is untouched (the scope's four-reader constraint).
- Fence: a `rolling_30d` read past a 15-day horizon must carry `windowPartial = true`.

**P6 — OBJ-3: the replay script and the fee SQL print what they read.** ← F8.
- Replay: read both joined tables' hot horizons; print each and the effective (minimum) horizon. When `ERA_START` is older than now minus the effective horizon, refuse with a message naming the warm tier, `b75-rehydrate.ts`, and the earliest servable era. An in-horizon era runs and prints the horizon. The C1 and sample queries print their populations.
- Fee SQL: one `\echo` + `SELECT` per table read, printing its hot horizon start.
- Test: the default invocation refuses with both pointers; an in-horizon era passes.

**P7 — OBJ-6 governance at Step 10.** ← F9, F10.
- `STORAGE_POLICY` rows; `PRE_LIVE_SPRINT.md:232` struck as absorbed; SIM `:2255`, #17 `:2262` (unconditional), `:2511`.
- System Manual `:12257` (this batch's rows plus the B70 tables) and `:12125`.
- `#688` closed into this batch; `BATCH_CATALOG`, `PHASE_HISTORY`, `CHANGES_AND_FIXES`; the tier ledger naming `SPRINT_TO_LIVE_PLAN.md` row 5c.
- Alert `c0a0b00d` resolved only on a measured `pg_database_size` under 133,120 MiB.

**UNAUDITED:** none. `switch_on_shadow_evidence` stays OUT (the scope's hold until alert `9399c9ed` on 2026-11-14); if that review flips it, it rides as an increment with its own audit.

## Judgement calls I want attacked
1. **P2** holds OBJ-1 until Infra's bar backlog drains: a delay of a night or two against ~20 GB.
2. **P4's rollback** is honest only before the cutover date. After it, the way back is a forward migration, not a rollback.
3. **P5** adds a client badge on the Analytics page. The scope's OBJ-2 verification is a screenshot of exactly that.
4. **P6** uses the MINIMUM of the joined tables' horizons, a refinement the scope did not have (F8).

---

## Plain-language summary
The audit confirmed the plan's numbers on the live database:
- About 20 GB comes out when the signal archive's window drops to 15 days.
- All six tables' December partitions are still empty, so the switch to daily partitions can start on December 1.
- Nothing that trades reads the archive further back than 14 days.

Three things changed the plan:
1. **The nightly cleanup is fast enough** to move the 20 GB in one extra hour. But Infra Claude just gave it a large backlog of their own, so the window change should land after that clears.
2. **The provenance-replay script joins two tables** that will keep different amounts of recent data. It has to report the shorter one, or its samples quietly lose rows.
3. **The System Manual's retention table is out of date** and is corrected at the end.

---

## AMENDMENT r2 (2026-11-08 ~01:40Z, CC-A) — Langston: Part A APPROVED, Part B CHANGES (Discord `1568797362317426709`); this SUPERSEDES P2 and P4's rollback and locking

**C-1 (blocking) — the rollback is registry revert AND SQL, one operation; the forward deploy states its ordering.**
- **Why:** the daily creator (`0 1 * * *`) loops `today … today+14` and skips only days before the cutover, so from 2026-11-17 it reaches 2026-12-01.
- With a registry entry live and a monthly `_2026_12` present, `ensureDailyPartition` passes its name probe and its `CREATE … FOR VALUES FROM ('2026-12-01')` throws on RANGE OVERLAP.
- There is no per-table catch (`main().catch → process.exit(1)`), so every registry table after the failing one loses its forward window — `signal_eval_archive` and `xstock_spot_ticker_snap` included.
- And `b-storage-archival-health.ts:272-277` skips pre-cutover tables, so nothing alerts for the six until 12-01. (This is the P19-B-PERPFEED BLOCKER-1 collider pointing the other way.)
- **P4 rollback, re-specified:** the rollback is a CODE revert of the six `DAILY_PARTITION_CUTOVERS` entries (P3) PLUS the SQL, shipped as one deploy. The SQL file's header says it MUST NOT be applied alone.
  - Valid only before the cutover date; it refuses after it (unchanged).
  - Order inside that deploy: the code revert and the SQL go out in the same `dt-deploy` (it runs the migration step with the code), so no 01:00 creator run sees one without the other.
- **Forward ordering, stated like P1's:** the registry entries (P3) and the cutover migration (P4) ship in ONE `dt-deploy`. The migration therefore runs before the next 01:00 creator run that sees the code. If a deploy ever applied the code without the migration, that 01:00 run would collide; the header says so.

**C-2 (blocking) — `SET LOCAL lock_timeout = '5s'`, single transaction kept, a deploy window.**
- The forward and rollback SQL both open with `SET LOCAL lock_timeout = '5s'` (the house convention since 2026-09-29: `b-sizing-inc2a`, `b-sizing-p5`, `f-g-1-ohlc-arrived-at`, `b-vts-no-decision-valve`). The cost it bounds: 66 DETACH + 96 CREATE, each ACCESS EXCLUSIVE on six continuously written parents, held to commit.
- **ONE transaction stays:** per-table commits would strand registry entries over surviving monthlies, which is C-1 again.
- **Deploy window:** NOT between 02:15Z and the sweep's `DONE` line (the 10-31 run took 95 min and DETACHes the same parents).

**C-3 (blocking) — the P2 hold is dropped to a note** (Langston's enumeration). At 145 days `crypto_spot_ohlc_1m`'s cutoff is 2026-06-16 and its `cutoffMonthStart` 06-01.
- Under the monthly rule `rangeStart < cutoffMonthStart`, exactly TWO children are eligible: `_2026_04` (7,741,440 B) and `_2026_05` (2,937,577,472 B) = 2,809 MiB. `_2026_06` is not.
- The 10-31 run moved 11 partitions / 22,330,368,000 B in 95 min with no per-run cap, so stage A drains in ONE run (tonight's), before this batch's code exists.
- **Note kept:** if OBJ-1 ever lands while a bar stage is mid-drain, read the two named children (or their successors, e.g. stage B's `_2026_06`/`_2026_07`) in the sweep log — never "no bar months left", which `DONE` cannot show (it carries no per-table fields).
- **First-night magnitude, corrected:** 16 dailies = **21,836 MiB** on the night the 15-day key lands. The earlier 20,328 MiB was the oldest 15.

**Folds (non-blocking, Step 3):**
- **P5 guards its own read:** the `data_lifecycle` read for `hotHorizonDays` sits in a try of its own. On any failure (an acquire timeout on the 4-slot `diagDb` included) each table's `hotHorizonDays` is null and `windowPartial` unknown; the panel never fails whole. The function has no outer try, and its per-table catch (`:882-892`) is what isolates a row. Fenced, that arm included.
- **P1 names the conflict target:** `module_constants_pkey` is `(module_name, exchange, asset_class, strategy, regime, constant_name)` (measured); every `data_lifecycle` row is `(data_lifecycle, *, *, *, *, <name>)`. The UPSERT is `ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)` with the `*` values written explicitly, never `ON CONFLICT (constant_name)`.
- **F9 restated:** the System Manual table carries 5 of 35 live `data_lifecycle` keys, and three of its names (`equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `equity_*_ohlc_1m`) were retired by the rename. P7 fixes the names in the rows it touches, adds the B70 tables, and says in-table that the bar rows are Infra Claude's (row 6) — it is not left half-corrected without a note.
- **Objective → plan coverage (the `#744` line):** OBJ-1 → P1 (and the P2 note); OBJ-2 → P5; OBJ-3 → P6; OBJ-4 → P3 + P4; OBJ-5 struck in scope r3; OBJ-6 → P7.
- **F6's control (Langston's addition):** these tables are not Drizzle-declared (`shared/schema.ts` has 0 hits for `signal_eval_archive` / `pair_scan_archive` / `signal_eval_provenance` against 9 for `closed_trades`), so the snake_case grep is the complete instrument. Of the live-code hits, only `drift-dashboard-aggregator.ts:831` is a read.
- **Nits corrected:** `computeDataArchiveStatus` is at **`:814`**. F2's six per-daily timings are a SIX-NIGHT series (10-02 … 10-07 dailies, one per run), not the 11-07 run; that run's SEA daily took 243,092 ms.

**§13 (Langston, found in the root crontab):** the `[B-STORAGE-HARDEN 2026-07-07] DISABLED — B70 tiering pending` comment sits directly above the LIVE `30 2 28 * *` b70 partition-creator line, so it reads as if that cron were off, with a dangling "re-enable at OBJ-2 close". **DISPOSITION:** added to Infra Claude's `B-DISK-HEADROOM` (row 6) — that session is already in these keys and has root. Told once.

---

## AMENDMENT r3 (2026-11-08 ~02:00Z, CC-A) — Langston: C-2 and C-3 cleared; C-1's mechanism refuted (C-4) and an abort gap (C-5); Discord `1568803708341330004`. SUPERSEDES r2's C-1 rollback mechanism

**C-4 (blocking) — the pre-cutover reversal is a dated FORWARD migration, not a rollback file.**
- **Why:** `dt-deploy:242` runs `npm run db:migrate` → `scripts/db-migrate.ts` (`package.json:12`). Its `:117` strips any filename containing `rollback` from the forward set, and `:120-123` throws if `MANIFEST.txt` holds one ("never legal here"). So r2's "the code revert and the SQL go out in the same `dt-deploy`" is false: a revert deploy would revert the registry and apply nothing.
- That would leave the registry entries gone, 96 dailies present and 66 monthlies dropped. Then `isDailyPartitionedForMonth` turns false for the six, so the b70 (`30 2 28 * *`) and b74 (`0 2 28 * *`) monthly creators build `…_2026_12` over the surviving dailies: RANGE OVERLAP, the same fatal shape.
- **The plan:** the way back before the cutover date is a dated FORWARD migration, `…-b-db-size-relief-cutover-reversal.sql`, registered in `MANIFEST.txt` and shipped in ONE `dt-deploy` with the code revert of P3's six entries. It is written at Step 3 beside the forward migration, tested, and NOT shipped unless needed.
  - It refuses after the cutover date, or if any daily it would drop is non-empty (heap = 0 AND `LIMIT 1`).
  - It drops the six tables' pre-created dailies, then recreates the monthly children with the monthly creator's bare-date bounds, under `SET LOCAL lock_timeout = '5s'` in one transaction (C-2 applies to it too).
- After the cutover date the way back is a forward migration of its own design, unchanged from judgement call 2.
- **The P1 key rollback is a different case:** a single `UPDATE` of one constant. It is applied BY HAND with `psql` (the convention for `-rollback.sql` files, which `db:migrate` refuses), and BEFORE any code revert, because a missing key aborts the night (F2).

**C-5 (blocking) — an aborted deploy can leave the registry live to the cron with the monthlies intact.**
- **Why:** `dt-deploy:222-223` runs `git reset --hard "$SHA"` BEFORE build and migrate, under `set -euo pipefail` (`:35`), and its only trap is `rm -rf "$LOCK_DIR"` (`:196`). Nothing unwinds the worktree on a failure.
- The daily creator is a cron, not the pm2 app (root crontab line 10, `0 1 * * *`, `cd /home/deploy/dawntrader && npx tsx server/scripts/b74-create-daily-partitions.ts`). It reads the WORKING TREE, so the entries go live at `git reset --hard`.
- C-2's 5 s lock timeout makes a migration abort plausible, and `b-storage-archival-health.ts:272-277` skips pre-cutover tables, so the six would be silent.
- **(i) P3 APPENDS** the six after the existing six (`daily-partition-cutover.ts:39-54`). The creator loops in array order with no per-table catch (`:84-107`, `main().catch → process.exit(1)`), so `xstock_spot_ticker_snap`, `signal_eval_archive`, both `crypto_perp` tables and both `xstock_bar_*` tables are provisioned before any collision. **This also narrows C-1's blast-radius sentence, which is order-dependent:** a collision on an appended table stops only the tables after it, i.e. the other new ones.
- **(ii) The deploy note carries the abort-recovery step:** on ANY failure at or after `db:migrate`, `git reset --hard` the staging clone to the pre-deploy sha before the next 01:00Z, finding it in `git reflog` — `dt-deploy` echoes `DEPLOYED_SHA` only on a lockfile diff (`:225`). Then confirm `daily-partition-cutover.ts` no longer holds the six.
- **(iii) Named verification:** read `b74-daily-partitions.log` on the first morning after the deploy, because the runway watchdog cannot see the six before 12-01.

**Cleared (Langston):** C-2 and C-3 as written in r2; all six folds; the objective → plan line covers OBJ-1 … OBJ-6 (OBJ-5 struck).
**Corrected in the body, not stacked (non-blocking):** `:814` in §0 and F7; P4's drop count is "the count the catalog lists".

---

## AMENDMENT r4 (2026-11-08 ~02:20Z, CC-A) — Langston CHANGES on r3 (Discord `1568808851753402381`): C-6 the reversal's holding place, C-7 the recovery branches on the ledger. SUPERSEDES r3's "written … not shipped" and its C-5(ii) step

**C-6 (blocking) — where the reversal waits, and what "tested" means.**
- **Why it needs a holding place:** `scripts/db-migrate.ts` enforces a BIJECTION between the forward `.sql` files in `drizzle/migrations/` and `MANIFEST.txt` (`:113-118` builds the forward set — every `*.sql` from a NON-recursive `readdirSync`, minus names containing `rollback`; `:127-149` throws on drift either way). A `…-cutover-reversal.sql` in that directory breaks every deploy if unlisted (for every batch), and applies itself at the next deploy if listed. Uncommitted is not an option either: `dt-deploy:214-219` refuses a dirty worktree.
- **The holding path:** `drizzle/migrations/held/2026-11-XX-b-db-size-relief-cutover-reversal.sql`.
  - `readdirSync` is non-recursive and keeps only `*.sql`, so a `held/` subdirectory is invisible to the bijection (`:115`). No other tooling sees `held/`. The census is repo-wide (Langston's wider instrument, adopted): two tests readdir the directory (`b-pattern-enum-drift.test.ts:47`, `b-balance-session-pairing-block-reason-enum.test.ts:46`), both non-recursive AND gated on `manifestLines.has(f)`; `drizzle.config.ts` has `out: "./migrations"`, a different directory, so drizzle-kit never reads `drizzle/migrations`. (My first instrument — `.github`, `Dockerfile*`, `scripts/*.sh` — reached neither `scripts/analysis/*.sh` nor `server/tests/**`.)
  - `drizzle/migrations/` has no subdirectories today, so `held/` is new and is named in the file's header.
  - **To use it:** ONE commit does `git mv drizzle/migrations/held/<file> drizzle/migrations/<file>`, adds its `MANIFEST.txt` line, AND reverts P3's six registry entries. That commit then goes out in one `dt-deploy`.
- **"Tested at Step 3", concretely:**
  - (1) An integration test in the suite, run where CI runs `db:migrate` (`ci.yml:101-102`, the step `run: npm run db:migrate` against the CI Postgres service; `:56` is a comment). It builds throwaway RANGE-partitioned parents shaped like the six (same partition key, a monthly child before the cutover, empty monthlies after it), applies the forward cutover SQL body, asserts the daily and monthly child sets, then applies the held reversal body and asserts the monthly set is back and the dailies are gone. Both refusal arms are exercised too: after the cutover date, and with a non-empty daily.
  - (2) A fence that the held file exists under `held/` and is NOT in `MANIFEST.txt`, so it can never be applied by accident.

**C-7 (blocking) — the abort-recovery step branches on whether the migration committed.** `dt-deploy` has four failure points AFTER `npm run db:migrate` returns at `:242`: `--pre-restart` (`:246-249`), `pm2 restart` (`:253`), the `LIVE_HEAD` assert (`:257-258`), and the 240 s engine poll (`:263-287`). The discriminator is the runner's own ledger, `_migrations` (`db-migrate.ts:63-76`), whose row is written after the SQL commits (`:193-195`). The recovery step in the deploy note reads:
- **Forward deploy aborted.** Query `_migrations` for the cutover file.
  - **Row ABSENT** — the migration did not commit, so the DB is still monthly while the registry entries are live in the worktree: `git reset --hard` the staging clone to the pre-deploy sha (found in `git reflog`; `dt-deploy` echoes `DEPLOYED_SHA` only on a lockfile diff, `:225`), then confirm the six are gone from `daily-partition-cutover.ts`.
  - **Row PRESENT** — the DB is in the daily state (monthlies dropped, dailies created): do NOT reset, which would build C-4's collision by hand. Re-run `dt-deploy <same sha>` (the migration is ledgered, so it skips), or take the C-4 reversal.
- **Reversal deploy aborted.** Query `_migrations` for the reversal file.
  - **Row PRESENT** — the DB is monthly again and the code revert is in the worktree, which is consistent. Re-run `dt-deploy <same sha>` to finish the restart.
  - **Row ABSENT** — the code revert removed the six from `DAILY_PARTITION_CUTOVERS` while the DB still holds only dailies. This case is SILENT: `b-storage-archival-health.ts:270` no longer iterates them, the daily creator no longer touches them, and the 16-day runway expires into "no partition of relation found for row". `git reset --hard` to the pre-reversal sha (registry entries restored, matching the daily DB), then retry the reversal.
- **The deadlines (fold 3), not "the next 01:00Z":**
  - `LOOKAHEAD_DAYS = 14` with `i <= LOOKAHEAD_DAYS` (`b74-create-daily-partitions.ts:41`, `:86`), so 2026-12-01 enters the daily window on **2026-11-17**. Before that the 01:00Z hazard is latent; from then on the deadline is the next 01:00Z.
  - The monthly creators' hazard is the **28th** of the month at 02:00Z (b74, `0 2 28 * *`) and 02:30Z (b70, `30 2 28 * *`).

**Folds (Langston: no further round needed):**
1. **The blast radius differs per creator.** For the DAILY creator, appending (C-5(i)) keeps the six existing tables ahead of any collision. The MONTHLY creators iterate their own hardcoded lists: `pair_scan_archive` is index 0 of `b70-create-monthly-partitions.ts:34-41`, so a C-4-shape collision there aborts that run before `switch_on_shadow_evidence` (held out of this batch, 3.3 M rows, monthly) gets its forward monthlies. In `b74-create-monthly-partitions.ts:36-43` the two new tables are indexes 4-5 of `SIX_TABLES`, so the four ahead of them are safe. Stated in the deploy note beside the recovery step.
2. **The reversal makes P4 non-replayable:** the forward file's `_migrations` row survives (`db-migrate.ts:155` filters applied files), so re-landing the cutover after a reversal needs a THIRD dated file. Said in the reversal's header.
3. The deadlines — above.
4. P4's drop set, re-derived by Langston on staging: 11 per table, `_2026_12 … _2027_10`, 66 in all. "The count the catalog lists" stands.

**§13 (Langston):** nothing watches the three partition-creator logs. `b-storage-archival-health.ts` has four log-freshness specs (`b75-retention`, `b75-cold-rotator`, `b75-cold-liveness`, `disk-file-tiering`), and `b74-daily-partitions.log`, `b74-partitions.log` and `b70-partitions.log` are absent, which is why C-5(iii) is a human read. **DISPOSITION:** added to Infra Claude's `B-DISK-HEADROOM` (row 6), the same home as the r2 crontab-comment item. Told once.

---

## STEP 2 CLOSED — Langston PROCEED on r4 (Discord `1568813558140108852`, board Review = Approved). Binding at Step 3, verified at Step 4:
- **C-8 — the forward-abort discriminator is the PARTITION CATALOG, not `_migrations`.**
  - **Why:** `db-migrate.ts:192` runs the file's own BEGIN/COMMIT as one `client.query`, and the ledger INSERT (`:193-195`) is a separate statement after it. So "row ABSENT ⇒ not applied" is false in that window, and ABSENT is the branch whose action is a worktree reset (C-4's collision by hand).
  - The deploy note's recovery reads `pg_inherits`/`pg_class` for the six parents: monthlies at/after the cutover present ⇒ NOT applied (reset the worktree); dailies present and those monthlies gone ⇒ APPLIED (do not reset). `_migrations` is corroboration only.
  - **Committed but unledgered:** P4 raises on a drop-count mismatch, so a re-run cannot heal that state. The hand step is: insert the `_migrations` row for the file, then re-run `dt-deploy <same sha>`. P4's exception text names that step.
- **C-9 — the integration test derives its SQL from the SHIPPED FILE'S BYTES** (the forward migration and the held reversal, read from disk), substituting throwaway parent names for the six real ones by a stated, mechanical rename. It never re-types an equivalent body, so a later edit to either shipped file is exercised.
- **C-10 — `.gitignore:47` is `*.sql` with no negations:** the held reversal is `git add -f` like P1's two files. Fence (2) — the held file exists and is NOT in `MANIFEST.txt` — is what catches an un-added file, since CI sees only the tracked tree.
- **The cron schedules — re-read as root on staging 2026-11-08 ~02:25Z, committed here so the leg is second-party checkable (Langston's account cannot read root's crontab):**
  - line 3: `0 2 28 * *` → `b74-create-monthly-partitions.ts` → `b74-partitions.log`
  - line 4: the misleading `# [B-STORAGE-HARDEN 2026-07-07 …] DISABLED — B70 tiering pending …` comment (Infra's §13 item)
  - line 5: `30 2 28 * *` → `b70-create-monthly-partitions.ts` → `b70-partitions.log` (LIVE)
  - line 6: `15 2 * * *` → `b75-retention-sweep.ts`
  - line 10: `0 1 * * *` → `b74-create-daily-partitions.ts` → `b74-daily-partitions.log`
  - line 13: `45 2 * * *` → `b-disk-file-tiering.ts` (runs during the sweep; not this batch's)
  - The C-7 deadlines therefore stand: 2026-11-17 (12-01 enters the daily window), then 01:00Z daily; the monthly creators on the 28th at 02:00Z and 02:30Z.
- **Next:** Step 3 at this batch's queue place (stage 00, order 5c — after `B-DB-POOL-GUARD` and `B-CLOSE-WRITER-COSTS`, which are in their verification steps waiting on external events; A1 jumps ahead of `B-CLOSE-WRITER-COSTS` if that batch is not done by ~2026-11-20, scope header).
