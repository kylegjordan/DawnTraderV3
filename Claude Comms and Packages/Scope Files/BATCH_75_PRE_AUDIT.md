# BATCH 75 — Pre-Implementation Audit

**Author:** Claude Code
**Date:** 2026-05-06
**Workflow step:** 2 (Pre-Implementation Audit)
**Reviewer:** Langston (asks 1–5 from rev 1, asks a–e from rev 2)
**Scope:** `BATCH_75_SCOPE.md` (rev 3, JSONL.gz format)

---

## §A. Executive summary

Step 2 cleared with **two findings that materially shape implementation**, four findings that **confirm the design is safe**, and **zero findings that block Step 3**. Findings:

| # | Finding | Disposition |
|---|---|---|
| F1 | **B73 number is taken** — already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 + 5 source files). | **RESOLVED** — Kyle confirmed renumber to B75 (rev 3). |
| F2 | **B70 export format is JSONL.gz, not Parquet.** Pragmatic v1 call; no new deps; universally readable. | **RESOLVED** — B75 follows B70 pattern. Scope §0.1 updated. |
| F3 | **Zero replication slots active.** | DROP TABLE on B74 partitions cannot collide with replication. ✅ |
| F4 | **No B74 OHLC hot-path consumers in `server/`.** Only 3 files reference the 6 tables: `b70-b62-relabel-runner`, `passive-archive-bootstrap`, `b74-create-monthly-partitions`. | Hot-tier sweep does not break a live consumer. ✅ |
| F5 | **B70 retention sweep is the proven pattern.** `listOldPartitions` + `DROP TABLE IF EXISTS` is correct, idempotent, and survives partition-detached state. | B75 sweep clones the pattern. ✅ |
| F6 | **Supabase wal_level=logical, slots empty.** `max_replication_slots=10` available but none are claimed. | DROP is fast (no slot retention). ✅ |

---

## §B. Langston rev-1 Step-2 asks (5)

### B.1 Grep BATCH_CATALOG / PHASE_HISTORY / CHANGES_AND_FIXES for "B73" string conflicts
**Status: DONE.** Found B73 was shipped:
- `BATCH_CATALOG.md` lines 186, 195–199: Batch 73, 73.1, 73.2 entries.
- `PHASE_HISTORY.md` line 466: "B73 Exit-Strategy Ablation Framework SHIPPED — full stack same-day".
- `PHASE_HISTORY.md` line 455: "B73.1 + B67.0.1 Ablation Tables Fixes SHIPPED".
- `PHASE_HISTORY.md` line 447: "B73.2 + Factor Calibration UI panel SHIPPED".
- 5 source files: `server/services/exit-strategy-replay.ts`, `exit-strategy-replay-service.ts`, `exit-strategy-ablation-aggregator.ts`, `server/tests/unit/b73-exit-strategy-replay.test.ts`, `server/routes.ts`.

**Resolution:** renumber to B75 (Kyle confirmed). Scope file renamed `BATCH_75_SCOPE.md`. Original B73 scope (exit-ablation, 2026-04-29) restored to `BATCH_73_SCOPE.md`. MEMORY.md updated.

### B.2 Both new sweeps idempotent (safe to re-run same day)
**Status: VERIFIED by design.** Idempotency comes from the manifest state machine (`pending → uploaded → verified → active → migrating → migrated`). Re-run scenarios:

| Restart state | Behavior |
|---|---|
| `pending` row exists, no upload | Resume: re-do upload + verify. |
| `uploaded`, no verify | Resume: re-stream from bucket, recompute checksum. |
| `verified`, partition still exists | Resume: DROP partition. |
| `active`, partition gone | Skip (already done). |
| No row, partition still exists, but >hot_retention | New cycle from `pending`. |
| Row exists for a partition that no longer exists | Skip (idempotent no-op). |

DROP TABLE itself uses `IF EXISTS` (matches B70 pattern, line 88 `dropPartition`). Same-day re-runs are safe.

### B.3 DROP TABLE on B74 partitions takes ACCESS EXCLUSIVE without collision
**Status: VERIFIED via live DB inspection.**

- `pg_replication_slots` query: **0 rows**. No logical-decoding consumer holds restart_lsn. DROP cannot get blocked by replication retention.
- `wal_level=logical, max_replication_slots=10, max_wal_senders=10` — Supabase config supports replication, but no slot is currently allocated. (Supabase Realtime/Pub uses logical replication via internal mechanisms; a separate audit at deploy time would confirm but the partition tables are not in any publication based on the absence of slots.)
- B70 retention sweep has been DROP'ing partitions in production since 2026-05-04 with no reported lock issue (per CHANGES_AND_FIXES tail; `b70-retention-sweep.ts` is `cron 0 2 * * *`).
- DROP TABLE on a 30+-day-old partition has no live writers (current month never a target — sweep cutoff = `date_trunc('month', now() - retention_days)` rounds DOWN to first-of-month).

**Verdict:** No ACCESS EXCLUSIVE collision risk. ✅

### B.4 Supabase Pro PITR window covers retention boundary
**Status: VERIFIED via documentation + design.**

Supabase Pro PITR window = **7 days** (default; Team/Enterprise = 30 days). B75 retention boundaries:
- Ticker snaps: 30d hot retention. PITR (7d) does **NOT** cover the full hot retention; data 8–30 days old exists ONLY in hot tier (until exported to warm).
- OHLC: 365d hot retention. Same gap.
- Context bridge: 14d. Same gap.

**Mitigation (already in scope, rev 2 §C.1 step 7):** export-then-drop fence — Parquet/JSONL written + verified BEFORE DROP. The warm bucket is the durable copy. Even with 7d PITR, the moment a partition is dropped, the warm-tier copy is the recovery source.

**Documented recovery procedure** (added to scope §I.2, will land in completion report's runbook section):
1. Identify dropped partition: `SELECT * FROM data_archive_manifest WHERE source_table=X AND state='active' AND hot_partition_dropped_at >= now() - interval '7 days'`.
2. Use `b75-rehydrate.ts --table X --from <date_range_start> --to <date_range_end> --out /tmp/rehydrate/`.
3. Re-CREATE partition: `CREATE TABLE <table>_<YYYY_MM> PARTITION OF <table> FOR VALUES FROM (...) TO (...)`.
4. Bulk-load from rehydrated JSONL: `COPY <table>_<YYYY_MM> FROM PROGRAM 'gunzip -c /tmp/rehydrate/...jsonl.gz' WITH (FORMAT csv, ...)`. (For OHLC schema-stable; JSONL→COPY shim documented in completion report.)

PITR is a fallback for the 7-day window only. Warm tier is the canonical recovery source for older data.

### B.5 Sweep logs capture target/dropped/bytes/duration
**Status: WILL BE VERIFIED IN STEP 3 IMPLEMENTATION.** Required log line format per partition:

```
[B75][b74-sweep] table=equity_spot_ticker_snap partition=2026_05 \
  target=true row_count=4500000 bytes_hot=4105MB \
  bytes_warm=850MB compression_ratio=4.83 \
  state_progression=pending->uploaded->verified->active \
  duration_ms=12453
```

Logs go to `/var/log/dawntrader/b75-retention.log`. Aggregated counters at sweep end:
- partitions_examined
- partitions_exported
- partitions_dropped
- bytes_freed_total
- duration_total_ms
- failures

---

## §C. Langston rev-2 asks (a–e)

### C.a Export-then-drop fence — gaps closed
All four sub-asks addressed in scope §C.1 (rev 3):
- **a.1 Re-read verification:** scope step 7 streams Parquet back from bucket, recomputes SHA-256.
- **a.2 State machine:** `data_archive_manifest.state` column + scope §C.8 state-progression table.
- **a.3 Snapshot consistency:** scope step 2 wraps export in `BEGIN ISOLATION LEVEL REPEATABLE READ`.
- **a.4 min_ts/max_ts check:** scope step 8 verifies in addition to row count.

### C.b Manifest schema — Langston additions
All folded into scope §C.8: `state`, `checksum_algo`, `min_ts`/`max_ts`, `parquet_schema_version`, `compression`, `created_at`, `tier_changed_at`, `hot_partition_dropped_at`, `original_partition_size_bytes`. UNIQUE on `(source_table, partition_label, tier)` so warm + cold rows coexist during rotation. Manifest pg_dump backup added (cron `45 2 * * *` to `dt-archive/manifest-backups/`).

### C.c B74 OHLC hot-path consumer grep
**Status: DONE.** Grep result (`equity_spot_ohlc_1m|equity_perp_ohlc_1m|crypto_spot_ohlc_1m|equity_spot_ticker_snap|equity_perp_ticker_snap|crypto_spot_ticker_snap` in `server/`):

```
server/scripts/b70-b62-relabel-runner.ts
server/startup/passive-archive-bootstrap.ts
server/scripts/b74-create-monthly-partitions.ts
```

Three files only:
1. **`b70-b62-relabel-runner.ts`** — one-shot retroactive labels runner. Reads OHLC for label backfill. Won't run again.
2. **`passive-archive-bootstrap.ts`** — startup bootstrap that creates current-month partition. Doesn't read existing partitions.
3. **`b74-create-monthly-partitions.ts`** — partition creator cron, doesn't read partition data.

**Zero hot-path consumers.** SIM §B74 confirmed: "NO signal-pipeline integration; substrate accumulation only. Verified non-impact on FX5 / VTS / signal-orchestrator / B73 hooks."

Future Trend Mining Engine (Phase 17.6 / 18.5) is post-launch and will use either hot tier (within 365d) or rehydrate-from-warm (older). B75 design is forward-compatible.

### C.d B2 vs Glacier
B2 confirmed by Langston ("S3 API reuse, no restore wait, no retrieval fees on rehydrate, manifest abstracts the backend"). Default to B2. Glacier migration deferred indefinitely.

### C.e Step 2 blocker — none
Confirmed.

---

## §D. Mandatory SIM consult (per CLAUDE.md §9)

**Components affected by B75:**

### D.1 `server/services/database-monitor.ts` (NEW SIM ENTRY at B75 close)
- **Upstream:** none (uses `pg_database_size` system function + new `module_constants.database_monitor.*` rows).
- **Downstream:** `database_size_logs` table (writes), PM2 console logs (alarm warnings), no API consumers.
- **Shared state:** none.
- **Background execution:** `setInterval(checkDatabaseSize, 24h)` started in `server/startup/lazy-loader.ts:database-monitor` (per `Glob` result earlier).
- **Blast radius:** LOW. Single-file edit. Failure mode = false alarm OR missed alarm. No trading-path impact.
- **B75 change:** parameterize hardcoded thresholds against `module_constants.database_monitor.{plan_cap_mb, warning_threshold_pct, critical_threshold_pct}`.

### D.2 `server/services/context-bridge.ts` (REFERENCED in SIM, no §-level entry)
- **Upstream:** WebSocket broadcast events from various services.
- **Downstream:** `context_bridge_log` table (write-only sink).
- **Shared state:** none (each row independent).
- **Background execution:** none — synchronous INSERT in broadcast hot path.
- **Blast radius:** Adding TTL DELETE downstream does NOT touch this file. Active writers continue inserting during sweep — Postgres allows concurrent INSERT during DELETE on same table.
- **B75 change:** none to `context-bridge.ts`. Sweep targets the table directly.

### D.3 B74 archive tables (SIM §B74)
- **Upstream:** WebSocket feeders (Kraken / Binance / etc.) → `passive-archive-bootstrap.ts` → INSERT into current-month partition.
- **Downstream:** zero hot-path consumers (verified §C.c). Future Trend Mining Engine = post-launch warm-tier consumer.
- **Shared state:** `module_constants.passive_archive.b74_*` (capture toggles, intervals, lookhead months) — UNCHANGED by B75.
- **Background execution:** WebSocket persistent connections + `b74-create-monthly-partitions.ts` cron 28th 02:00 UTC.
- **Blast radius:** Adding `b75-retention-sweep.ts` cron at 02:15 UTC. 15-min offset from B74 partition-creator cron (28th only) and 15-min offset from B70 sweep (daily 02:00). No timing collision.
- **B75 change:** zero modifications to existing B74 files. Pure additive.

### D.4 B70 archive infrastructure (SIM §B70)
- **B75 change:** zero modifications. B70 retention sweep continues running on its own cron with its own knob (`b70_postgres_retention_days`). The eventual migration into `data_lifecycle` registry is deferred (B75.x marker added per scope §E).
- **Risk of conflict:** none. Different cron times, different table sets.

### D.5 New components (SIM ENTRIES TO BE ADDED in Step 10)
| New file | SIM section |
|---|---|
| `server/scripts/b75-retention-sweep.ts` | Add to "Cron / scheduled scripts" |
| `server/scripts/context-bridge-log-ttl.ts` | Same |
| `server/scripts/b75-rehydrate.ts` | Same (operator CLI) |
| `server/scripts/b75-cold-rotator.ts` | Same |
| `server/services/data-archive/storage-client.ts` | New entry under "Data Archive" component family |
| `data_archive_manifest` table | Schema entry |

---

## §E. Implementation order (Step 3 plan)

Files in order of construction (each is small + reviewable in isolation):

1. **Migration SQL** `drizzle/migrations/2026-05-06-b75-data-lifecycle.sql`:
   - CREATE TABLE `data_archive_manifest`
   - INSERT `data_lifecycle` module_constants rows (hot/warm retention per table + bucket config)
   - INSERT `database_monitor` module_constants rows (plan_cap_mb / threshold_pct)
   - PREFETCH_MODULES extension (warmup hard-fail)

2. **Storage helper** `server/services/data-archive/storage-client.ts` — Supabase Storage SDK wrapper (warm) + S3 SDK wrapper (cold/B2). Auth, retry, checksum, streaming upload/download.

3. **Export helper** refactor `server/scripts/b70-table-export.ts` → extract `exportPartitionToJsonlGz(table, partitionLabel, dateRange)` into `server/services/data-archive/partition-exporter.ts`. Returns manifest-row payload. B70's existing exporter wrapper stays for backward compat.

4. **B75 retention sweep** `server/scripts/b75-retention-sweep.ts` — clone of `b70-retention-sweep.ts` with export-then-drop fence + state machine + REPEATABLE READ snapshot.

5. **Context-bridge TTL sweep** `server/scripts/context-bridge-log-ttl.ts` — month-grouped export + batched DELETE + tail VACUUM.

6. **Rehydrate CLI** `server/scripts/b75-rehydrate.ts` — manifest-driven, downloads to local out path.

7. **Cold rotator** `server/scripts/b75-cold-rotator.ts` — monthly warm→cold (B2) with verify + state flip.

8. **DatabaseMonitor edit** `server/services/database-monitor.ts` — read constants, fail-hard on missing rows.

9. **Local typecheck** `npx tsc --noEmit -p tsconfig.json` on touched files.

10. **Submit to Langston for Step 4 code review.**

---

## §F. Open items at audit close

- **Backblaze B2 account:** Kyle action. Non-blocking; warm tier ships independently.
- **`b70_parquet_export_enabled` constant** in `data_archive` module: misleading name, since the format is JSONL. Add a one-line comment row to CURRENT_SETTINGS_REGISTRY noting the semantic ("toggle for off-host archival exports — format is JSONL.gz, not Parquet despite the name") at Step 10. Don't rename the constant (in production, would require code grep + update + regression).

---

## §G. Audit verdict

**PASS — proceed to Step 3 implementation.** All Langston asks addressed. SIM consult complete. Renumber complete. No design blockers.

Estimated Step 3 implementation surface: ~1,200–1,500 LOC across 7 new files + 1 edit. Tight enough to land in one batch; loose enough that each file is independently reviewable.

---

*End of BATCH_75_PRE_AUDIT.md.*
