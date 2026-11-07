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
