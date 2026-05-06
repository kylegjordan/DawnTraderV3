# BATCH 75 — Data Lifecycle / Storage Cost — Scope

**Author:** Claude Code (System Cartographer)
**Date drafted:** 2026-05-06
**Last revised:** 2026-05-06 (rev 3 — renumbered B73 → B75 after Step 2 audit found B73 was already shipped)
**Workflow step:** 1 → 2 (renumbering during Step 2 pre-audit)
**Reviewer:** Langston (rev 1 + rev 2 reviews received and folded in)
**Branch base:** `migration/aws-supabase` @ `6c42dc370` (B72.2 close, PM2 #171)

---

## §0. Rev 2 framing change (2026-05-06, post-Kyle directive)

Rev 1 of this scope treated retention as **delete-after-N-days**. Kyle's directive (verbatim): "we don't ever drop data, especially not now when we're not sure what data is going to be valuable and when." Rev 2 reframes the entire batch as a **tiered hot/warm/cold storage architecture** with no destructive deletion at any tier boundary.

**Tiered design:**

| Tier | Storage | Cost (est) | Latency | Retention |
|---|---|---|---|---|
| HOT | Supabase disk (live, indexed SQL) | ~$0.125 / GB-month | ms | Short (30d ticker / 365d OHLC / 14d ctx-bridge) |
| WARM | Supabase Storage (Parquet objects) | ~$0.021 / GB-month (~6× cheaper) | seconds (duckdb / polars read) | Medium (1 year, then rotated to cold) |
| COLD | S3 Glacier Deep Archive (or Backblaze B2) | ~$0.001 / GB-month (~125× cheaper) | hours (restore request) | Indefinite |

**Cost projection** for current ingest (~1.4 GB/day across B74 = ~511 GB/year):
- Five years full-fidelity in Glacier = ~$2.55 / month
- Five years in Supabase Storage Parquet (warm) = ~$54 / month
- Five years on Supabase disk (rev 1's pure-DROP would have been here without the cap) = ~$320 / month

**Operational principle:** at every tier boundary, data is **moved, not deleted.** A partition leaves the hot tier only when its Parquet export to warm tier is verified. A Parquet object leaves the warm tier only when its Glacier upload is verified. Glacier objects are never deleted.

**OHLC hot retention:** 365d (Kyle confirmed; Langston rec #2 accepted). With cold tier guaranteeing indefinite preservation, the hot retention number is now a query-latency-vs-disk-cost tuning knob, not a "do we keep it" decision.

**Future rehydration readiness:** rev 2 adds a manifest table + a rehydrate CLI (§C.8 / §C.9) so any future ML/analytics scheduler can plug in without code changes. The scheduler itself is deferred to a post-launch batch when actual analytics workloads are defined.

**Format choice (rev 3, post-Step-2 finding):** Step 2 pre-audit found B70 already chose **JSONL.gz** over Parquet for archival exports (`server/scripts/b70-table-export.ts`, comment block lines 9–20). Rationale: zero new npm deps; `parquetjs-lite` is unmaintained; GDrive npm install hits EBADF on Parquet libs. JSONL.gz is universally readable by pandas / duckdb / tsfresh / mlfinlab / Qlib. Cold-tier cost delta vs Parquet at our scale = ~$1/year (negligible). **B75 follows B70: JSONL.gz, not Parquet.** All scope text below should be read as JSONL.gz where it says "Parquet" — a one-line `Parquet → JSONL.gz` rename will land in implementation. If query latency from cold tier ever becomes an issue, a Python sidecar can convert JSONL.gz → Parquet on demand without changing upstream.

> **Note on renumbering (rev 3, 2026-05-06):** This batch was originally drafted as B73. Step 2 pre-audit grep across `1-system-manual/` and `server/` revealed B73 was already shipped on 2026-04-29 as the Exit-Strategy Ablation Framework, with B73.1, B73.2, B73.3 follow-ups. Five production source files use the `b73-` prefix. The MEMORY entry "B73 — NEXT BATCH" was a label collision predating governance reconciliation. Kyle confirmed renumber to **B75** (next free top-level slot after B72/B73/B74). All in-document, code, and constants references use B75 from rev 3 forward. The original B73 scope file (exit-ablation, 2026-04-29) has been restored to `BATCH_73_SCOPE.md`.

---

## §A. Trigger

Supabase auto-expanded the staging DB disk **12 → 18 GB** on 2026-05-06 05:10 UTC. Live `pg_database_size` = **10.0 GB**. Daily growth ≈ **1.4 GB/day**. At current rate the project hits the Supabase Pro 200 GB auto-expand cap by **September 2026**.

**Internal `DatabaseMonitor` alarm has been firing "88.7% of 10 GiB" since the auto-expand** — the 10 GiB threshold in `server/services/database-monitor.ts:31-37` is hardcoded and stale.

---

## §B. Live ground truth (queried 2026-05-06)

### B.1 Top storage consumers

| Rank | Table / partition | Size | Owner | Partitioned? | Has retention sweep? |
|---|---|---|---|---|---|
| 1 | `equity_spot_ticker_snap_2026_05` | 4,105 MB | B74 passive archive | YES (month) | **NO** ← B75 fix |
| 2 | `context_bridge_log` (unpartitioned) | 1,354 MB | WebSocket observability | NO | **NO** ← B75 fix |
| 3 | `equity_perp_ticker_snap_2026_05` | 1,126 MB | B74 | YES | **NO** |
| 4 | `equity_spot_ohlc_1m_2026_05` | 1,033 MB | B74 | YES | **NO** |
| 5 | `crypto_spot_ohlc_1m_2026_05` | 616 MB | B74 | YES | **NO** |
| 6 | `crypto_spot_ticker_snap_2026_05` | 439 MB | B74 | YES | **NO** |
| 7 | `equity_perp_ohlc_1m_2026_05` | 224 MB | B74 | YES | **NO** |
| 8 | `signal_eval_archive_2026_05` | 197 MB | B70 archive | YES | YES (b70-retention-sweep, 90d) |
| 9 | `execution_attempt_audit` (unpartitioned) | 153 MB | execution audit | NO | NO |
| 10 | `walter_memory` (static legacy) | 139 MB | retired | NO | static, no growth |

**Punchline:** B74's 6 passive-archive tables = ~7.5 GB / 75% of total DB. Their partition *creator* runs (28th 02:00 UTC) but a partition *dropper* was never built. B70's pattern needs to be applied to B74.

### B.2 `context_bridge_log` distribution

- Range: 2025-12-26 → 2026-05-06 (132 days, no TTL)
- Total rows: 1,649,875
- Daily volume: ~2,700–3,000 rows / ~3.8 MB raw payload (TOAST + indexes amplify to ~10 MB/day on disk)
- **At 14-day retention:** ~42K rows, ~140 MB. **Recovers ~1.2 GB immediately.**

### B.3 Partition pre-creation status

B74 has 12 forward-dated partitions per parent (2026-06 → 2027-04, all 24 KB / empty). Created by `server/scripts/b74-create-monthly-partitions.ts`. Pre-2026-04 partitions DO NOT exist (data only began accumulating end of April with B74 launch). Older-partition deletion is therefore not yet triggering — **B75 builds the dropper before old partitions exist that need dropping** (preventive, not corrective).

### B.4 Retention-policy registry candidates

Existing single knob: `data_archive.b70_postgres_retention_days = 90` (covers B70 archive tables only).

**B75 introduces:** `data_lifecycle` module with per-table retention values, additive to B70's existing knob.

---

## §C. Numbered objectives (verification criteria in §D)

### **Obj 1. Build B74 export-then-drop sweep (warm-tier wired)**
Create `server/scripts/b74-retention-sweep.ts` modeled on `b70-retention-sweep.ts`, but with **export-then-drop ordering**:

For each B74 partition older than its hot retention, the export-then-drop fence (Langston rev-2 ask a):

1. **Insert manifest row** (state=`pending`).
2. **Open snapshot:** `BEGIN ISOLATION LEVEL REPEATABLE READ`. All count + min_ts + max_ts + COPY-to-Parquet operations run from same snapshot — eliminates concurrent-write false-mismatches (Langston ask a.3). Implication enforced upstream: only sweep partitions older than the writable window (current month is never a target).
3. **Compute partition stats** within snapshot: `row_count`, `min(ts)`, `max(ts)`.
4. **COPY to Parquet** within snapshot using existing `server/scripts/b70-table-export.ts` patterns. Compute SHA-256 on local file. Update manifest with stats + checksum.
5. **COMMIT** snapshot.
6. **Upload** Parquet to warm bucket at `warm/<table>/<YYYY-MM>.parquet`. Update manifest state=`uploaded`.
7. **Re-read** Parquet from bucket (Langston ask a.1) — stream object back, recompute SHA-256. Compare to step 4 checksum. If mismatch → state=`pending` (will retry next run); raise alert; abort this partition.
8. **Verify** row count + min_ts + max_ts in the re-read object match the partition's stats from step 3 (Langston ask a.4). If mismatch → same abort path.
9. Update manifest state=`verified`, set `verified_at=now()`.
10. **DROP partition** in a separate transaction. Update manifest state=`active`, set `hot_partition_dropped_at=now()`.

If any step 6–8 fails, partition is **NOT** dropped. Sweep continues to next partition; failed exports retry on next run (idempotent — state machine ensures we resume from last good state without double-export).

Cron entry: `15 2 * * *` (15-min offset from B70's 02:00 sweep). Logs to `/var/log/dawntrader/b74-retention.log` capturing target/exported/dropped/bytes_recovered/duration per partition (Langston ask #5).

### **Obj 2. Add `data_lifecycle` module + per-table tier constants**
New `module_constants` rows under `module_name = 'data_lifecycle'` (one constant_name per table per tier-boundary):

**Hot → warm boundaries** (when partition leaves Supabase disk and lands as Parquet in Supabase Storage):
- `equity_spot_ticker_snap.hot_retention_days = 30`
- `equity_perp_ticker_snap.hot_retention_days = 30`
- `crypto_spot_ticker_snap.hot_retention_days = 30`
- `equity_spot_ohlc_1m.hot_retention_days = 365`
- `equity_perp_ohlc_1m.hot_retention_days = 365`
- `crypto_spot_ohlc_1m.hot_retention_days = 365`
- `context_bridge_log.hot_retention_days = 14`

**Warm → cold boundaries** (when Parquet leaves Supabase Storage and lands in Glacier / B2):
- `*.warm_retention_days = 365` (default for all tables; Parquet stays in warm tier 1 year before rotating to cold)

**Cold tier:** indefinite. Never deleted.

Both new sweeps (B74 + context_bridge) and the cold rotator read from this module. Single source of truth — adding a new periodic table = one row per tier boundary.

**Rationale for hot retention values:**
- Ticker snaps (~700 MB/day equity-spot alone) = high-churn observability with weak forward signal value. 30 days = enough for live dashboards / very-short-horizon analyses; older data still fully accessible from warm tier in seconds.
- OHLC 1m = primary Trend Mining Engine input (Phase 17.6 / 18.5 per SIM §B70 forward-couples). 365d = full annual cycle on disk for low-latency pattern stats; older data accessible from warm tier.
- `context_bridge_log` = WebSocket broadcast audit trail. 14d on disk for incident postmortems; older data archived to cold tier (low value but follows the never-delete principle).

### **Obj 3. Build `context_bridge_log` export-then-TTL sweep**
New `server/scripts/context-bridge-log-ttl.ts`. Two-phase:

1. **Export** rows older than hot retention to `cold/context_bridge_log/<YYYY-MM>.parquet` in Supabase Storage. Group by month so file naming is stable. Register in `data_archive_manifest`.
2. **Delete** the exported rows: `DELETE FROM context_bridge_log WHERE timestamp < now() - interval '<N> days' AND timestamp < (SELECT date_trunc('month', now()) - interval '...')` in batches of 10K with brief pauses. Reads N from `data_lifecycle.context_bridge_log.hot_retention_days`.
3. **VACUUM** `context_bridge_log` at sweep tail (Langston rec #1 required). Plain VACUUM, no FULL.

Cron `30 2 * * *`. Logs match B74 sweep format (target / exported / deleted / bytes / duration).

**Note:** Pure DELETE (no partition drop) because the table is not partitioned. Partitioning `context_bridge_log` is **deferred to B75.1** (separate batch) — a no-downtime migration with parallel-write window is non-trivial and out of scope here.

### **Obj 4. Fix `DatabaseMonitor` stale 10 GiB threshold (Langston-revised)**
Edit `server/services/database-monitor.ts` lines 28–37. Replace hardcoded `8192` (80% of 10 GiB) and `6656` (65%) with values computed from a new `module_constants` module:
- New module: `database_monitor`
- Constants:
  - `plan_cap_mb` (default `204800` = 200 GB Pro plan auto-expand cap) — **the real ceiling that costs money to break**, stable across Supabase disk auto-expansions.
  - `warning_threshold_pct` (default `0.65`)
  - `critical_threshold_pct` (default `0.80`)

**Why `plan_cap_mb` and not `size_limit_mb`:** Langston rec #3. Hardcoding the auto-expanded disk size (18 GiB now) silently drifts every time Supabase expands. Tracking against the Pro plan cap (200 GB) gives a stable warning curve through unlimited future auto-expansions; alarm only re-tunes when the project moves between Supabase plan tiers.

Per Kyle directive (CLAUDE.md §11): no hard-coded fallbacks for DB-governed settings — fail hard if the module rows are missing rather than silently default.

### **Obj 5. First execution + verification on staging**
Run all sweeps + rehydrate CLI **once manually** post-deploy. Verify:
- B74 sweep: logs "no partitions to drop" for each of the 6 tables (correct — pre-2026-04 partitions don't exist yet). Confirms wiring correctness even though no data leaves hot tier yet.
- `context_bridge_log` export-then-TTL: ~1.6M rows exported to ~5 monthly Parquet files in warm tier (Dec 2025 + Jan/Feb/Mar/Apr 2026), manifest rows registered, then deleted from hot tier. Table size shrinks from 1,354 MB to <200 MB. Pre/post `pg_total_relation_size` recorded.
- Manifest: `SELECT COUNT(*) FROM data_archive_manifest` returns ≥5 rows post-ctx-bridge sweep.
- Rehydrate CLI: round-trip test — invoke `b73-rehydrate.ts --table context_bridge_log --from 2026-01-01 --to 2026-01-31 --out /tmp/test/`. Verify Parquet downloaded, row count matches manifest, file readable by `duckdb -c "SELECT COUNT(*) FROM read_parquet('/tmp/test/...')"`.
- Cold rotator: dry-run mode (`--dry-run` flag) — no rows yet old enough to rotate (warm retention 365d, exports just happened), so logs "0 candidates" cleanly.
- DatabaseMonitor: logs new percentage against 200 GB plan_cap_mb. Alarm transitions from `critical` → `normal`.
- Supabase Storage bucket `dt-archive`: list operation succeeds via service-role key; warm/ prefix shows expected Parquet objects.

### **Obj 6. Cron installation on staging**
Crontab entries in `/etc/cron.d/dawntrader` on Hetzner staging:
```
0  2 * * * deploy ... b70-retention-sweep.ts ...      (existing, unchanged)
15 2 * * * deploy ... b74-retention-sweep.ts ...      (NEW — export-then-drop)
30 2 * * * deploy ... context-bridge-log-ttl.ts ...   (NEW — export-then-TTL)
0  3 1 * * deploy ... b73-cold-rotator.ts ...         (NEW — monthly warm→cold)
```

### **Obj 7. Provision Supabase Storage warm-tier bucket**
Create `dt-archive` bucket in the staging Supabase project. Private (no public read), service-role write, server-only. Path layout:
```
dt-archive/  (Supabase Storage — WARM tier)
  warm/
    equity_spot_ticker_snap/
      2026-04.parquet
      2026-05.parquet
      ...
    equity_spot_ohlc_1m/
      2026-04.parquet
      ...
    context_bridge_log/
      2026-01.parquet
      ...
    ... (one folder per source table)
```

Cold tier lives in a **separate** S3-compatible bucket (Backblaze B2 default — see Obj 10). Cold-tier path: `dt-archive-cold/<table>/<YYYY-MM>.parquet`. Bucket creation deferred to Step 6 (deploy) since it requires an external account; until then, sweeps export only to warm tier (cold rotator runs `--dry-run` until B2 credentials land).

Configuration via `module_constants` (`data_lifecycle.warm_bucket = 'dt-archive'`, `data_lifecycle.warm_prefix = 'warm'`, `data_lifecycle.cold_bucket = 'dt-archive-cold'`, `data_lifecycle.cold_prefix = ''`, `data_lifecycle.cold_provider = 'b2'`). Service-role key for warm tier already in staging `.env` (`SUPABASE_SERVICE_ROLE_KEY`); B2 credentials added at Step 6 once Kyle provisions the B2 account. Confirm warm-tier read/write in pre-audit Step 2.

### **Obj 8. `data_archive_manifest` table (the rehydration seam — Langston-revised)**
New table + Drizzle migration. Schema reflects Langston rev-2 review (b): state machine, separate min_ts/max_ts from partition_label, explicit checksum_algo + compression, hot-tier drop audit, separate rows per tier (no UPDATE-in-place).

```sql
CREATE TABLE data_archive_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  partition_label TEXT NOT NULL,           -- e.g. '2026-05'
  tier TEXT NOT NULL,                      -- 'warm' | 'cold'
  state TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'uploaded' | 'verified' | 'active' | 'migrating' | 'migrated'
  storage_uri TEXT NOT NULL,               -- e.g. 'supabase://dt-archive/warm/equity_spot_ticker_snap/2026-05.parquet'
  min_ts TIMESTAMPTZ NOT NULL,             -- actual min(timestamp) in the Parquet, not partition bound
  max_ts TIMESTAMPTZ NOT NULL,             -- actual max(timestamp)
  date_range_start TIMESTAMPTZ NOT NULL,   -- partition declared start
  date_range_end TIMESTAMPTZ NOT NULL,     -- partition declared end
  row_count BIGINT NOT NULL,
  bytes_compressed BIGINT NOT NULL,
  original_partition_size_bytes BIGINT,    -- compression-ratio drift signal
  parquet_schema_version INT NOT NULL DEFAULT 1,
  compression TEXT NOT NULL DEFAULT 'zstd',-- 'snappy' | 'zstd'
  checksum_algo TEXT NOT NULL DEFAULT 'sha256',
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,                 -- set when post-upload re-read checksum matches
  hot_partition_dropped_at TIMESTAMPTZ,    -- set when source partition was DROP'd from hot tier
  tier_changed_at TIMESTAMPTZ,             -- warm→cold rotation timestamp
  UNIQUE (source_table, partition_label, tier)
);
CREATE INDEX data_archive_manifest_source_range ON data_archive_manifest (source_table, min_ts, max_ts);
CREATE INDEX data_archive_manifest_state ON data_archive_manifest (state) WHERE state != 'active';
```

**State machine** (Langston rev-2 ask a.2):
- `pending` → row inserted at start of export
- `uploaded` → Parquet write to bucket completed
- `verified` → post-upload re-read checksum matches local computed checksum (Langston ask a.1)
- `active` → manifest row complete, hot partition dropped (or rows deleted for non-partitioned)
- `migrating` → cold rotator started moving warm→cold (still readable from warm)
- `migrated` → cold copy verified; warm bytes deleted; manifest row remains for audit trail (Langston ask: keep both rows). Concurrently a NEW row in tier=`cold` exists in `active` state.

**Crash recovery:** sweep restart sees stale `pending` / `uploaded` rows for partitions whose hot-tier source still exists → resume from last verified state. Stale `verified` row + hot partition still present → resume DROP. No double-export.

The manifest is the **single source of truth** for "what exists in archives, where, and how to find it." Future analytics jobs and rehydration schedulers query this table once instead of needing to know storage layout.

**Manifest backup (Langston rev-2 ask):** daily `pg_dump -t data_archive_manifest` to warm bucket at `dt-archive/manifest-backups/<YYYY-MM-DD>.sql.gz`. Cheap insurance against losing the index. Cron `45 2 * * *`.

### **Obj 9. `b73-rehydrate.ts` CLI**
New `server/scripts/b73-rehydrate.ts`. One-shot manual today; future schedulers wrap it.

Usage:
```
npx tsx server/scripts/b73-rehydrate.ts \
  --table equity_spot_ohlc_1m \
  --from 2025-12-01 \
  --to   2026-02-28 \
  --out  /tmp/rehydrated/  \
  [--restore-cold]   (default: warn + skip cold-only entries)
```

Behavior:
1. Query `data_archive_manifest` for `source_table` rows whose `[date_range_start, date_range_end]` overlaps `[--from, --to]`.
2. For each match in **warm tier**: download Parquet from Supabase Storage to `--out`.
3. For each match **cold-only**: emit a Glacier restore-request job and exit with notice (or, with `--restore-cold`, wait synchronously up to a configurable timeout).
4. Print a summary table: file path, rows, bytes, date range covered.

Output Parquet files can be read directly by analytics tools (duckdb, polars, pandas). Optionally a `--load-into-temp-table` flag is added in a follow-up if a use case emerges.

### **Obj 10. Warm → cold rotator (`b73-cold-rotator.ts`)**
New `server/scripts/b73-cold-rotator.ts`. Monthly cron (`0 3 1 * *` — 03:00 UTC on the 1st):

For each manifest row in `tier='warm'` with `exported_at < now() - <warm_retention_days>`:
1. Stream Parquet object from Supabase Storage → cold-tier destination.
2. Verify upload integrity (size match, checksum).
3. UPDATE manifest: `tier='cold'`, `cold_storage_uri=...`, `rotated_to_cold_at=now()`.
4. Delete from Supabase Storage warm bucket.

**Cold-tier destination** for B75: provisional placeholder. Two options to confirm in pre-audit Step 2:
- **Backblaze B2** (~$0.006/GB-mo) — S3-compatible API, simpler setup, no restore wait.
- **AWS S3 Glacier Deep Archive** (~$0.001/GB-mo) — cheapest, 12-hour restore wait.

For B75 ship, recommend **Backblaze B2** as the cold tier MVP (S3 API reuse, no restore complexity). Glacier migration deferred to B75.4 if cost ever justifies it. **Decision flag:** if Kyle has a strong preference for Glacier from day one, easy to swap (both use s3 SDK). Default to B2 unless Kyle objects.

### **Obj 11. Governance updates**
Tier 1: BATCH_CATALOG, PHASE_HISTORY, MEMORY (truth + repo persistence), BATCH_73_SCOPE (this), BATCH_73_PRE_AUDIT, BATCH_73_COMPLETION_REPORT.
Tier 2: SYSTEM_IMPACT_MAP (add B75 retention sweeps; update §B70 + §B74 component inventories), SYSTEM_MANUAL (new "Data Lifecycle Policy" subsection), CHANGES_AND_FIXES (close stale-10GB-alarm), CURRENT_SETTINGS_REGISTRY (new `data_lifecycle` + `database_monitor` modules).

---

## §D. Verification criteria (binary, evidence-backed)

| # | Objective | Pass condition | Evidence |
|---|---|---|---|
| 1 | B74 sweep exists + runs | `server/scripts/b74-retention-sweep.ts` present, runs without error, reads `data_lifecycle.*` rows | Manual run log + `psql` confirm |
| 2 | data_lifecycle module seeded | 7 rows under `data_lifecycle` | `SELECT COUNT(*) FROM module_constants WHERE module_name='data_lifecycle'` = 7 |
| 3 | context_bridge_log TTL works | Table size < 200 MB after first run; oldest row ≥ now() - 14 days | `pg_total_relation_size` + `MIN(timestamp)` |
| 4 | DatabaseMonitor fixed | Latest `database_size_logs` row shows `alertLevel='normal'`; PM2 logs reference 18 GiB not 10 GiB | PM2 logs + DB row inspection |
| 5 | First-pass: all three sweeps run cleanly post-deploy | No errors in stderr; expected counts match | Manual invocation logs |
| 6 | Cron lines installed | `cat /etc/cron.d/dawntrader` shows 3 lines | SSH inspection |
| 7 | Governance complete | All Tier 1 + applicable Tier 2 docs updated; SIM has new B75 entry | `git diff --stat` includes 1-system-manual files + Claude Comms |

---

## §E. Out-of-scope (deferred to follow-on batches)

- **B75.1 — Partition `context_bridge_log` forward.** No-downtime migration with parallel-write window. Untouched here.
- **B75.2 — Partition `execution_attempt_audit` + `walter_memory`.** 153 MB + 139 MB combined; low-priority compared to B74 ticker snaps. **Pinned in PHASE_HISTORY at B75 close** (Langston ask) so it doesn't fall off the radar.
- **B75.3 — Cold-storage tier (Parquet → Supabase Storage).** B70 already has `b70_parquet_export_enabled = false` flag and `server/scripts/b70-table-export.ts`. Wiring export-then-drop is a meaningful separate batch; pure DROP suffices for B75's storage-cost goal.
- **B75.x — Migrate `b70_postgres_retention_days` into `data_lifecycle` registry.** B75 leaves the B70 single-knob alone (purely additive). B70's existing sweep continues reading from `data_archive.b70_postgres_retention_days`. The constant gets a "to be deprecated by B75.x" comment in `CURRENT_SETTINGS_REGISTRY` so future devs know the migration is pending; actual code migration deferred until there's a reason to consolidate.
- **`database_size_logs` (63 MB) self-pruning** — small enough to defer.

---

## §F. Risk + blast radius (pre-pre-audit; full SIM trace in Step 2)

| Component | Blast | Note |
|---|---|---|
| `b70-retention-sweep.ts` | NONE | Untouched. 90-day window unchanged. |
| `b74-retention-sweep.ts` | LOW | New file. Runs on its own cron. **Export-then-drop**: partition NOT dropped unless Parquet export verified (row count match + checksum). Failed exports retry next run (idempotent). Active partition (current month) never a drop target. |
| `context_bridge_log` export-then-TTL | MEDIUM | High row count (~1.6M). Batched (10K) with pacing. Export per-month before delete. Active writers (`server/services/context-bridge.ts`) continue writing — DELETE does not block INSERT in PG. Tail VACUUM (plain, no FULL) returns disk to OS without lock. |
| `database-monitor.ts` | LOW | Single class, single file, daily timer. New module_constants reads only. |
| `data_lifecycle` constants module | LOW | New module name; no collision. Adds tier boundaries + bucket config. |
| `data_archive_manifest` table | LOW | New table. Append-only from sweeps. Manifest is the read-side seam; nothing in the hot path depends on it. |
| `b73-rehydrate.ts` CLI | NONE | Read-only. Pulls Parquet from warm/cold to local disk. Never writes back to live DB. |
| `b73-cold-rotator.ts` | LOW | Monthly. Verifies upload before deleting from warm bucket. Dry-run mode for first month until B2 account verified. |
| Supabase Storage `dt-archive` bucket | LOW | New private bucket. Service-role write only; no public path. |
| Backblaze B2 cold bucket | LOW | New external account. Single-tenant (DawnTrader only). Credentials in staging `.env` only; never committed. |

---

## §G. Sequencing within batch

1. **Migration SQL** — creates `data_archive_manifest` table; seeds `data_lifecycle` + `database_monitor` modules with all tier-boundary + bucket constants.
2. **Storage helper module** — small `server/services/data-archive/storage-client.ts` wrapping Supabase Storage SDK + S3 SDK (B2 uses S3-compatible API). Service-role auth, retry, checksum compute.
3. **Parquet export helper** — adapt existing `server/scripts/b70-table-export.ts` into a reusable function `exportPartitionToParquet(table, partitionLabel)` that returns manifest-row payload.
4. **Sweep scripts** — `b74-retention-sweep.ts`, `context-bridge-log-ttl.ts`, `b73-cold-rotator.ts`. Each consumes the helpers above.
5. **Rehydrate CLI** — `b73-rehydrate.ts`. Manifest query + storage-client download.
6. **DatabaseMonitor edit** — `server/services/database-monitor.ts` reads `database_monitor.*` constants.
7. Local `tsc --noEmit` on touched files.
8. **Code review** (Step 4 with Langston, pre-push).
9. **Push → CI → deploy** — at deploy, also: provision Supabase Storage `dt-archive` bucket, install crons.
10. **First-pass verify** (manual sweep + rehydrate round-trip + DatabaseMonitor).
11. **Cold-tier wiring** — once Kyle provides Backblaze B2 credentials: add to staging `.env`, drop dry-run flag from cold rotator, run a one-off rotation test against a tiny manually-created warm Parquet object to confirm end-to-end path. (Can lag the main deploy; sweeps export to warm tier independently.)
12. **Governance + completion report.**

---

## §H. Open questions for Langston

1. **Retention values** — are 30 days (ticker snaps) and 180 days (OHLC) reasonable from a Trend Mining Engine / Phase 17.6 standpoint, or should OHLC be longer (365)?
2. **Cron timing** — 02:00 / 02:15 / 02:30 UTC stagger acceptable, or do you want them more spread?
3. **`execution_attempt_audit` (153 MB)** — defer entirely (current scope), or include a 90d TTL pass in this batch?
4. **B70 retention extension** — `b70_postgres_retention_days = 90` is currently the global knob. Should B75 deprecate it in favor of `data_lifecycle.<table>.retention_days` per-table (and have the existing B70 sweep migrate to read from the new registry), or leave B70's knob alone and only have B75's new module cover the new tables?

Default if no objection: 30/180 retention, staggered cron, defer `execution_attempt_audit`, leave B70 knob alone (purely additive).

---

## §I. Langston-driven additions (post-Step-1 review)

Resolved (folded into objectives above):

- **§C.3 VACUUM** added to context_bridge_log TTL sweep tail.
- **§C.4 DatabaseMonitor** reframed against `plan_cap_mb=204800` (200 GB Pro cap), not the moving auto-expand size.
- **§E** updated: B75.2 pinned in PHASE_HISTORY; B70 knob marked "to be deprecated by B75.x" in CURRENT_SETTINGS_REGISTRY.

Pending Kyle decision (does NOT block Step 2 pre-audit):

- ~~**OHLC retention 180d vs 365d.**~~ **RESOLVED 2026-05-06: 365d** (Kyle confirmed, accepted Langston rec #2).
- **Backblaze B2 account provisioning** (or alternative cold-tier provider). External account creation is the one thing Claude Code cannot do on Kyle's behalf (per safety rules). B75 ships warm tier independently; cold rotator runs in dry-run mode until credentials land in staging `.env`. Nice-to-have but not Step-3-blocking.

Step 2 pre-audit asks (Langston):

1. Grep `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `CHANGES_AND_FIXES.md` for any "B75" string that doesn't refer to this storage batch — confirm no partial work shipped under the legacy exit-ablation B75 label.
2. Confirm both new sweeps are idempotent (safe to re-run same day).
3. Confirm `DROP TABLE` on B74 partitions takes `ACCESS EXCLUSIVE` cleanly without colliding with active readers / replication slots / WAL archival on Supabase. Should be a non-issue at 30+-day-old partitions but verify in SIM trace.
4. Confirm Supabase Pro **PITR (point-in-time recovery) window** covers the retention boundary — i.e. if a partition drop is wrong, can we recover from the platform itself? Document recovery procedure before the first production cron firing.
5. Sweep logs must capture: target count, dropped count, bytes-recovered estimate, duration. Logging-via-`context_bridge_log` is fine since 14d retention provides plenty of audit trail.

5. **B73 number reuse** — RESOLVED in rev 3. Step 2 audit grep found B73 was already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 follow-ups + 5 source files using `b73-` prefix). Renumbered to B75. See §0 note.

---

*End of BATCH_73_SCOPE.md.*
