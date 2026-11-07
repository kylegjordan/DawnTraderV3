# B-DISK-HEADROOM — CHANGE LIST (Step 4)

**Batch:** B-DISK-HEADROOM (plan row 6) · **change-class:** non_architecture · **Step 2:** `Scope Files/B_DISK_HEADROOM_PRE_AUDIT.md`, APPROVED by Langston 2026-11-07 (§5 there) · **Owner:** Infra Claude

## What changes
**No application code changes.** The batch changes three settings in `module_constants` (`data_lifecycle`, `<table>.hot_retention_days`), first to proof values and back (OBJ-3), then to 30 (OBJ-4). What is new is the tooling that makes each write and each night checkable:

| file | kind | what it does |
|---|---|---|
| `scripts/analysis/b_disk_headroom_eligibility.ts` | NEW, read-only | evaluates the deployed sweep's own `classifyPartition` / `isPartitionEligible` at any instant with any override; prints every eligible child and its `pg_total_relation_size` (pre-audit §1.5). Landed at `434d08731`. |
| `scripts/analysis/b_disk_headroom_set_retention.sh` | NEW, **writes one row** | the ONLY way this batch writes a setting (P3, P5, P8). Accepts only the three bar tables, a whole number 1..365, an `updated_by` beginning `B-DISK-HEADROOM `. One transaction: one row before; UPDATE rowcount = 1 on all six key columns; one row after, `jsonb_typeof = 'number'`, value and `updated_by` as written; any miss raises and nothing commits. Then a **new session after COMMIT** re-reads all four and exits 4 on any mismatch. `DRY=1` rolls back. |
| `scripts/analysis/b_disk_headroom_lock_sampler.sh` | NEW, read-only | P4: 10-second samples of lock waits and ACCESS EXCLUSIVE locks on the bar tables across the proof night, with a positive-control row (any active session naming a bar table). Stops at a given time or 10 min after the sweep process exits. |

## Tests run
- `set_retention.sh`, `DRY=1 … crypto_spot_ohlc_1m 145 "B-DISK-HEADROOM OBJ-3 stage A"` on staging, 2026-11-07 07:1xZ: `IN-TX OK … = 145 (number)`, rolled back. Re-read after: all four `*_ohlc_1m.hot_retention_days` unchanged (365/365/365 and `crypto_perp` 30), `updated_by` unchanged.
- Refusals: `signal_eval_archive 15 …` → `REFUSED: table…`, exit 2; `updated_by "oops"` → `REFUSED: updated_by…`, exit 2.
- Sampler: a 25-second run with nothing on the bars logged no rows; a 30-second run alongside a 15-second `pg_sleep` whose text named a bar table logged it as `ACTIVE-ON-BARS` (the positive control).
- **Not tested, stated:** the post-COMMIT leg and the in-transaction failure branches (a real write is the proof night itself). The failure branches are each one `RAISE EXCEPTION` under `ON_ERROR_STOP`.

## The first proof night (Stage A), planned for 2026-11-08 02:15Z
P2 after 18:00Z on 11-07: the deployed-copy hash command (pre-audit §1.7) and the eligibility instrument at T = 2026-11-08T02:15Z with `crypto_spot_ohlc_1m=145`, outputs appended here. Then the write, by the script, with N = 145. Then the sampler armed from 02:10Z. Next morning P5: the eligible set `{2026-04, 2026-05}` and no `2026-06` in the sweep log, the five pre-registered daily controls, the manifest and evidence rows, the children gone; then the restore to 365 by the same script.

## Judgement calls to attack
1. The `updated_by` allow-pattern and the 1..365 bound are the script's only input fences; the table list is a fixed `case`. Is anything else needed for a script that runs by hand as `deploy`?
2. The post-COMMIT check compares the psql `-A -t` text of `value` with the decimal string of the number written. For an integer JSON number those are identical; a fractional N is refused by the integer pattern.
3. The sampler keys "the sweep has exited" on `pgrep -f b75-retention-sweep`; the tsx process carries that path in its argv.

## Step 4 round 2 — Langston's B1-B4 (his ruling, Discord `1568528062860234894`, at `aefb0395b`)
- **B1 (leading zero read as octal, measured by him: `0999` accepted and stored as 999):** `set_retention.sh` now takes `^[0-9]{1,4}$`, normalises with `DAYS=$((10#$DAYS))`, then range-checks; the DO block carries its own `IF days < 1 OR days > 365 THEN RAISE`. Step 2 compares against the normalised number. **Tested on staging, DRY:** `0145` → IN-TX OK 145; `08` → IN-TX OK 8; `0999` → REFUSED (read as 999), exit 2; `366` and `0` → REFUSED, exit 2. **Mutant** (bash range check replaced by `if false`): `0999`… `999` → `ERROR: BOUND: 999 is outside 1..365`, exit 3, nothing written. Live values re-read after: unchanged.
- **B2 (exit-code collision):** documented codes — 0 ok · 2 REFUSED, nothing written · 3 transaction failed, nothing written · 4 COMMITTED but the read DISAGREES · **5 COMMITTED but UNVERIFIED** (the post-commit psql failed; it is now inside `if !`, so `set -e` cannot turn it into 2).
- **B3 (presence, not magnitude):** every sampler row now carries `query_start`, `state_change` and `pg_blocking_pids(pid)`; a `# tick` line per sample; the sweep's `pgrep -af` line logged once when first seen; the DB role logged at start. **Positive control with a real lock wait** (advisory lock 424242, held 15 s by one session, wanted by a second whose text names a bar table; no table touched): logged at 07:32:04 and 07:32:14 as `Lock|advisory`, `query_start 07:32:04`, blocker `{3524535}`; gone by the 07:32:24 tick ⇒ the wait was 10-20 s, read from the rows, not inferred. Role: `postgres` (his measurement: other sessions' `query` is visible to it).
- **B4:** P2 now also hashes `/home/deploy/b_disk_headroom_set_retention.sh` and `/home/deploy/b_disk_headroom_lock_sampler.sh` against their blobs at the sha cleared here, and refuses to run either if they differ; both run as `bash <path>`.
- **Citation:** the whole-night abort is `loadConfig` called once at `b75-retention-sweep.ts:1308` inside `try`/`finally` with no catch, `reqNum` at `:234-236`; `:145` was a comment. Fixed in the script header and pre-audit P3.

## Step 4 round 3 — Langston's r2 change (Discord `1568530475021246595`, at `c2da0e0cd`)
B1-B4 confirmed by him at the ref. **One change:** the sampler's relation filter (`:27`) and its positive control (`:41`) named only the three bar tables this batch changes, and left out `crypto_perp_ohlc_1m` — 30-day, daily children, the one bar table that drops a child every night (`PARTITIONED_TABLES` `:128`). Both alternations now carry it; the header and pre-audit P4 say four. **`set_retention.sh` is unchanged and stays fenced to the three** (his instruction). Control on staging, 07:40Z: a 12-s `pg_sleep` whose text named `crypto_perp_ohlc_1m` logged as `ACTIVE-ON-BARS` in 2 samples.

## P2 — the pre-write checks for the 2026-11-08 02:15Z proof night (Infra Claude, read 2026-11-07 18:00-18:15Z)
**1. Deployed copy.** Staging HEAD `942c65424a1ee7bc785bb57917ea62c0186fe9bc` (OLD Claude's deploy, 17:51:31Z); porcelain on the sweep paths EMPTY; `sha256sum` on staging = `git show 942c65424:<path> | sha256sum`: `b75-retention-sweep.ts` `673c8623…836db` both sides, `sweep-slicing.ts` `5b0150eb…3ea021` both sides (= §1.5's figure, unchanged).
⚠️ **`b75-retention-sweep.ts` CHANGED since `2c692f9cc` (§1.5's `46765364…36be` → `673c8623…`), which by this document's own rule re-opens §1.4-§1.5.** The one commit is `0ff82cc25` (B-CLOSE-WRITER-COSTS inc 3 Part A, C-2): one import (`NON_OUTCOME_CLOSE_REASONS` from `trade-close-reason.ts`) and, in `sweepPlainTables`'s exploration tally, `close_reason IS DISTINCT FROM 'never_filled'` → `(close_reason IS NULL OR close_reason <> ALL($2::text[]))`. **Read for reach:** not on the partition path (listing, `classifyPartition`/`isPartitionEligible`, export, `dropPartition`); the tally runs only when the plain archive lane archives exploration rows (`closed_trades` at 365 days: last night "no age-eligible rows"). **It is new to tonight:** last night's deployed `6c39f14cb` does NOT contain `0ff82cc25` (ancestry checked), so tonight is the first sweep with it. **The one leg that runs every night regardless — the import at load — loads on staging:** `npx tsx -e import(trade-close-reason)` → `["never_filled","hard_reset"]`; `trade-close-reason.ts` has no imports of its own.
Also checked, from OLD Claude's same deploy (B-DB-POOL-GUARD inc 3, the app pool's `statement_timeout` 25 s): **the sweep does not use that pool.** It opens its own `pg.Client({ connectionString })` (`b75-retention-sweep.ts:770, 771, 1058, 1091, 1306, 1331`) and no module it imports loads `server/db.ts` (each import list read whole: `partition-exporter`, `storage-client`, `sweep-slicing`, `system-alerts`, `trade-close-reason`, `exact-archive-evidence`, `archive-completeness` — node builtins, `pg`, and each other). (A grep-pattern check was abandoned: its positive control returned empty, so its silence was worthless.)
**2. The two scripts, against the Step-4 blobs at `c5682ec6b`:** `set_retention.sh` `d0e1cbb6…e5e28211`, `lock_sampler.sh` `2e801a79…6a83ca` — staging = blob, both; neither changed between `c5682ec6b` and `942c65424`. The instrument `b_disk_headroom_eligibility.ts` `cda8a1e1…98128f7` = its blob at `942c65424`.
**3. The instrument at T = 2026-11-08T02:15:00Z, `crypto_spot_ohlc_1m` = 145 (OVERRIDE), against the deployed `sweep-slicing.ts` — output verbatim:**
```
at 2026-11-08T02:15:00.000Z · slice_threshold_hot_bytes 3221225472 · slicing /home/deploy/dawntrader/server/services/data-archive/sweep-slicing.ts
xstock_spot_ticker_snap: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=1 bytes=925204480
    xstock_spot_ticker_snap_2026_10_08  daily  925204480 B  whole lane
xstock_perp_ticker_snap: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
crypto_spot_ticker_snap: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
crypto_perp_ticker_snap: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=1 bytes=371671040
    crypto_perp_ticker_snap_2026_10_08  daily  371671040 B  whole lane
xstock_spot_ohlc_1m: retentionDays=365 cutoff=2025-11-08T02:15:00.000Z cutoffMonth=2025-11-01 eligible=0 bytes=0
xstock_perp_ohlc_1m: retentionDays=365 cutoff=2025-11-08T02:15:00.000Z cutoffMonth=2025-11-01 eligible=0 bytes=0
crypto_spot_ohlc_1m: retentionDays=145 (OVERRIDE) cutoff=2026-06-16T02:15:00.000Z cutoffMonth=2026-06-01 eligible=2 bytes=2945318912
    crypto_spot_ohlc_1m_2026_04  monthly  7741440 B  whole lane
    crypto_spot_ohlc_1m_2026_05  monthly  2937577472 B  whole lane
crypto_perp_ohlc_1m: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=1 bytes=98697216
    crypto_perp_ohlc_1m_2026_10_08  daily  98697216 B  whole lane
xstock_bar_revision_event: retentionDays=8 cutoff=2026-10-31T02:15:00.000Z cutoffMonth=2026-10-01 eligible=1 bytes=849747968
    xstock_bar_revision_event_2026_10_30  daily  849747968 B  whole lane
signal_eval_archive: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=1 bytes=1513054208
    signal_eval_archive_2026_10_08  daily  1513054208 B  whole lane
pair_scan_archive: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
exit_decision_archive: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
macro_feed_archive: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
signal_eval_provenance: retentionDays=30 cutoff=2026-10-09T02:15:00.000Z cutoffMonth=2026-10-01 eligible=0 bytes=0
switch_on_shadow_evidence: retentionDays=90 cutoff=2026-08-10T02:15:00.000Z cutoffMonth=2026-08-01 eligible=0 bytes=0
TOTAL eligible bytes 6703693824
```
**= §1.5 exactly:** the five pre-registered children at the pre-registered bytes, plus `crypto_spot_ohlc_1m_2026_04` 7,741,440 B and `_2026_05` 2,937,577,472 B, both whole lane; total 6,703,693,824 B, the §1.5 figure. **Value to write: 145** (the band (130.0, 160.2) was measured at this same T; its midpoint rounds to 145).
**Gate before the write:** the re-open is ruled by Langston, not by me — the rule is this document's own and I am the one it binds.

**P2 re-open — RULED PROCEED (Langston, Discord `1568691122082156586`, at `942c65424`): §1.4 and §1.5 close PASS; write 145.** He re-derived, not on report: (1) ORDER — `sweepPlainTables` runs after the whole partition loop (`b75-retention-sweep.ts:1427`), so the proof is done before the changed line; (2) the tally is UNREACHABLE tonight by construction — `closed_trades` at 365 days, oldest `closed_at` 2026-07-15, age-eligible 0, `minTs === null` skips the branch; (3) a throw there fails `closed_trades` alone (`:1202`). The SQL resolves (`close_reason` is `character varying`, not an enum); positive control with the window opened to now(): crypto_spot 240, xstock_spot 2; old vs new predicate identical today (0 `hard_reset` exploration rows). Installed script digests hashed by him independently.
**Two corrections folded into the record (his, no new work):**
1. **Citation drift from the two inserted lines — re-pinned at `942c65424`, to be carried into the completion report:** §1.4 cutoff/cutoffMonth `:1325-1327` → **`:1327-1329`**; §1.5 `bytesHot` `:450` → **`:451`**; P3 `reqNum` `:234-236` → **`:235-237`**; P3 `loadConfig` call `:1308` → **`:1310`**; criterion 4's `retentionDays=` echo `:1338-1345` → **`:1340-1345`**. `sweep-slicing.ts:151/:152` unchanged.
2. **⛔ The pool-guard wording overstated:** the import walk proves the app pool's 25 s does not reach the sweep — **it does NOT make the sweep unbounded.** A raw `$DATABASE_URL` connection (role `postgres`) inherits `statement_timeout = 2min` from the platform defaults (no `pg_db_role_setting` override for `postgres`). Tonight's 2.74 GiB `_2026_05` whole-lane export is safe under that because `partition-exporter.ts:168` keyset-pages at `BATCH = 1000` inside `REPEATABLE READ READ ONLY`, so no single statement is large. His empirical check: 0 statement-timeout lines in 2,993 lines of `b75-retention.log` (positive control: 159 `DONE`, 163 lines containing `FAILED`), whole exports to 1.59 GB / 306 s already landed. Pre-existing, unchanged by the deploy.
His scope limit, stated: the 02:15Z schedule is read from the log's `started at` lines (two runs), not from a crontab (root's is outside his privilege).

## P3 — THE WRITE (2026-11-07 18:18:47Z, Infra Claude)
`su - deploy -c 'bash /home/deploy/b_disk_headroom_set_retention.sh crypto_spot_ohlc_1m 145 "B-DISK-HEADROOM OBJ-3 stage A"'` → **exit 0.** `NOTICE: IN-TX OK: crypto_spot_ohlc_1m.hot_retention_days = 145 (number), by B-DISK-HEADROOM OBJ-3 stage A`; `POST-COMMIT (new session): 1|145|number|B-DISK-HEADROOM OBJ-3 stage A|2026-11-07 18:18:48.409247+00`; `PASS`.
**Read back through the sweep's own path:** the eligibility instrument with NO override at T = 2026-11-08T02:15Z now reads `retentionDays=145` for `crypto_spot_ohlc_1m` and is **byte-identical to the P2 override run except the `(OVERRIDE)` tag** — April 7,741,440 B + May 2,937,577,472 B, total 6,703,693,824 B.
**Exposure if the morning restore were missed:** June becomes eligible from 2026-11-23T00:00Z at N = 145 — archived, never deleted (P5).

## P4 — THE SAMPLER, SCHEDULED ON STAGING (not dependent on this session being awake)
`systemd-run --unit=b-disk-headroom-sampler-20261108 --on-calendar="2026-11-08 02:10:00 UTC" --timer-property=AccuracySec=1s --uid=deploy --gid=deploy --working-directory=/home/deploy /bin/bash /home/deploy/b_disk_headroom_lock_sampler.sh 2026-11-08T05:15:00Z /home/deploy/b_disk_headroom_locks_20261108.log` — `list-timers` shows NEXT `Sun 2026-11-08 02:10:00 UTC`, unit `User=deploy`. It stops 10 min after it has SEEN the sweep exit (`seen_sweep` gates the exit window), or at 05:15Z; the plan's floor is ≥02:45Z. **Unit proven now, not trusted:** an identical transient run for 25 s (`b-disk-headroom-sampler-test`, log `/home/deploy/b_disk_headroom_locks_TEST.log`) wrote `# sampler start … db role postgres`, three `# tick` lines at 10 s spacing, zero `# sample failed`, and `# sampler stop (until reached)`. ⚠️ A transient timer does not survive a reboot of staging before 02:10Z; the morning read checks the log exists and starts at 02:10Z.
