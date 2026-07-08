# B-STORAGE-HARDEN — Wave C Pre-Audit (Step 2, OBJ-2)

change-class: architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-08
**Scope:** `B_STORAGE_HARDEN_WAVE_C_SCOPE.md` (Langston Step-1 APPROVED with the memory-gate + two additions folded here).

## 1. Langston's Step-2 GATE — export peak-memory on the JSONB-wide `signal_eval_archive` — ✅ CLEARED (measured, not by analogy)
Concern: BATCH=1000 was tuned against numeric-narrow ticker rows; `features`/`gate_decision` JSONB could blow the footprint. **Measured on the real 14.5 GB `signal_eval_archive_2026_06` partition (1-hour sample, 36,023 rows):**

| metric | value |
|---|---|
| avg row | **459 B** · p95 496 B · **max 1158 B** |
| `features` JSONB | avg 164 B / max 824 B |
| `gate_decision` JSONB | avg 113 B / max 160 B |
| `modulators` JSONB | avg 37 B |

**BATCH=1000 peak (raw rows held in `r.rows`): typical 0.5 MB · p95 0.5 MB · pathological all-max 1.2 MB.** Even at node-postgres's ~2–3× parsed-object overhead that's ≤3.6 MB/batch on a 3.7 GB box, sweep off-peak. The JSONB here is small structured regime/gate metadata, NOT blobs — the table is 25.6 GB from **volume** (~36k narrow rows/hour), the same profile as the ticker tables the slicer already handles. **Verdict: BATCH=1000 is safe; no per-table override / byte-budget needed.** (Per-day slicing still applies — the partition >3 GB slice threshold triggers ~400–500 MB/day uncompressed slices, well under the 5 GB object cap, streamed.)

## 2. Blast radius — `b70-retention-sweep.ts` rule-18 deletion
- **In-app callers: ZERO.** Repo-wide grep for `b70-retention-sweep` → only doc files (SIM, RUNNING_ISSUES, System Manual). No `import`/require anywhere. It is a standalone cron script.
- **Cron reference (Langston's ask — check the crontab, not just imports):** ONE line, the root crontab entry (already PAUSED/commented from Wave A): `#0 2 * * * … b70-retention-sweep.ts …`. Removal = delete that commented line. No systemd timer unit (all archive crons are root-crontab, confirmed Wave A).
- **Config constant `b70_postgres_retention_days`:** read by (a) the sweep being deleted, and (b) `archive-config.ts:98` → exposed as `retentionDays` on the B70 config object. **`retentionDays` has NO other consumer** (grep of `data-archive/*` for `.retentionDays` = zero hits outside archive-config). So per Langston: remove the CODE reference this batch — drop the `retentionDays` field from `archive-config.ts` (+ its `asInt` line + the DEFAULT + the interface field) since its only reader dies with the sweep. **The DB row stays as data** (harmless; a future re-introduction can re-read it). This closes the lingering-legacy smell §15 forbids.

## 3. Implementation plan (surgical)
1. **`b75-retention-sweep.ts`:** add 5 entries to the partitioned-archive inventory (the existing `B74_TABLES` loop, or a parallel `B70_TABLES` list processed by the SAME loop — decide at impl; identical handling): `{parent: <table>, timestampColumn: 'captured_at', retentionConstantName: '<table>.hot_retention_days'}` for `signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance`. No machinery change (export→warm→verify→drop + slicing + alerts all reused).
2. **Migration** `2026-07-08-b-storage-harden-wave-c-b70-retention.sql`: `INSERT` the 5 `data_lifecycle.<table>.hot_retention_days = 90` rows (idempotent `ON CONFLICT DO NOTHING`). Registered in `drizzle/migrations/MANIFEST.txt` (`git add -f`).
3. **Delete `b70-retention-sweep.ts`** → archive to `_archive/deleted-code/b70-retention-sweep.ts.removed` + `DELETED_COMPONENTS_LOG.md` entry (what/why/blast-radius/commit); remove the commented cron line from root crontab.
4. **`archive-config.ts`:** remove the `retentionDays` field + its `asInt`/DEFAULT/interface lines (the constant's last code reader).
5. **Archival-health watchdog:** the B70 tables now flow through `b75-retention.log` → the existing `b75-retention` check covers them. Update the watchdog's b70 comment from "skipped while paused" to "b70-retention retired; B70 tables tiered via b75 sweep" (accuracy, not behavior).
6. **`b70-create-monthly-partitions.ts` STAYS** (create ≠ drop; the tables still need forward partitions).

## 4. ★ DEPLOY RUNBOOK ORDERING (Langston hard-fail gate — migration BEFORE code)
The sweep's `loadConfig` `reqNum('<table>.hot_retention_days')` **throws hard** if a key is missing. A mis-ordered deploy = a crashed nightly sweep for ALL archive tables (B74 + B70). So the ordered steps are NON-NEGOTIABLE:
1. **Apply the migration FIRST** (seed the 5 `data_lifecycle` rows) — verify all 5 present via a read-back query.
2. **THEN deploy the code** (`git pull && build && pm2 restart`) that references those keys.
3. Remove the b70 cron line + delete the script.
4. Run the bounded proof (retention override on a tiny table).
Rollback: the migration is additive (5 config rows) + idempotent; the code is revertible; the deleted script is archived. If the sweep ever can't find a key it fails LOUD (fail-closed, no silent drop).

## 5. Verification (Step-7)
- Migration applied, 5 keys read back = 90.
- Bounded real proof on `exit_decision_archive` (or `macro_feed_archive`, ~tens of MB): run the b75 sweep with a retention override so that tiny table's oldest partition exports hot→warm (manifest row + object + download-verify) then DROPs only after verify; then the cold-rotator (override) moves it warm→cold + rehydrate-verify checksum match — same discipline as Wave-A OBJ-1.
- `b70-retention-sweep.ts` gone + archived + logged + cron line removed; `tsc` + grep prove zero dangling refs (incl. `archive-config.retentionDays`).
- Normal (non-override) sweep run logs the 5 B70 tables as "no partitions older than <90d cutoff>" (nothing past 90d today — correct, no real drops).
- CI 4-green; governance (SIM B70 + B75 sections, System Manual data-lifecycle if the tiering scope changes, CHANGES, RUNNING_ISSUES #430 fully closed + #432 bytes_moved cosmetic folded, DELETED_COMPONENTS_LOG, catalog/history/plan, completion, both MEMORYs).

## 6. Open confirmations for Langston (Step-2)
1. Memory gate cleared at BATCH=1000 (numbers above) — agree no override needed?
2. `archive-config.ts` `retentionDays` field removal this batch (constant's last code reader) — agree, or leave the field + only delete the sweep?
3. Bounded proof target = `exit_decision_archive` (smallest, realized-trade outcomes) — good, or prefer `macro_feed_archive`?
4. Fold the trivial #432 (`bytes_moved` string-concat cosmetic in the rotator) into this wave since I'm touching the archive path? (low-risk 1-line `Number()` coercion.)
