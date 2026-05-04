# BATCH 70 — Unified Data Archiving (Pair Scan + Signal Eval + Exit Decision + Macro Join)

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-04
**Status:** Step 2 — APPROVED by Langston (cc-inbox #894 + #895 + #896, 2026-05-04). Pre-audit ready (`BATCH_70_PRE_AUDIT.md`). Mode-agnostic capture (Kyle directive 2026-05-04) + `mode`/`source` two-column discriminator (Langston #896) folded. Step 3.0 (run-mode accessor strategy) approved. **Next session: Step 3.1 — migration commit.**
**Parent program:** Phase 15c — pre-Phase-16 buildout
**Predecessor:** B69 Asset Class as First-Class Schema Dimension (SHIPPED PM2 #137 + B69.1/2/3 follow-ups through PM2 #141).
**Successor:** B67.5 consumer wiring (gated on B67.4 calibration check ~2026-05-15); External Data Tier-2 decision gate (post-B67.5 + post-observation); B72 lever sweep; ML-light (B75).
**Window dependency:** Runs in parallel with the four calibration observation windows (B67.4 closes 2026-05-15; B68.2/3 close 2026-05-16; B68.1 closes 2026-05-17). B70 is observation-only data capture; no expected interaction with calibration data.

---

## Why this batch exists

DawnTrader currently archives in three disconnected places:

1. **B74 passive archive pipeline** — OHLC + ticker for 380 crypto-spot pairs + 38 xStock-spot + 10 xStock-perp. Continuous, partitioned, joinable by timestamp. **But: only price/volume — no scan-state, no signal-eval, no exit-decision context.**
2. **B67.0 `regime_factor_alternates` + B73 `exit_strategy_alternates`** — counterfactual ablation rows tied to closed trades. Per-factor and per-variant. **But: only fires on admitted trades that closed; nothing for rejected pairs / null-signal evaluations / unscored cycles.**
3. **VTS eval history files** (`logs/vts_eval_history/`) — per-strategy counters (evaluated, nulls, signals, rejected). Counter-only; no per-pair, per-cycle, per-feature row.

What's missing is the **per-pair × per-cycle × per-strategy fact table** with the full feature snapshot at evaluation time. This is the data the Trend Mining Engine (Phase 17.6 / 18.5, post-launch) needs to discover candidate signals we never explicitly hypothesized. Without it, post-launch ML must re-derive features from raw OHLC at training time, which is slow and recreates context that's already computed once per cycle inside MCE / signal-orchestrator / VTS-runner.

This is also the **B62 retroactive re-labeling opportunity** (Option B from earlier directives): the Mar 6 – Apr 16 VTS data was generated under the pre-B62 classifier. Re-labeling it under the post-B62 classifier gives a clean training set spanning ~6 weeks before the audit.

The Kyle directive: **capture maximally; structure for both human + automated analysis** — Parquet + Postgres queryable by tsfresh / Featuretools / Qlib / mlfinlab / custom Python without retrofit. B70 is the data-capture batch that makes Trend Mining Engine + ML-light possible without a future backfill batch.

---

## Goals

1. **Per-pair scan-state archive** — every MCE cycle (60s), every pair in the watchlist, one row capturing: regime label + confidence, DBS + category, ATR%, momentum z, ADX, volume ratio, spread%, friction, all 7 modulator inputs (raw / macro / phase / freshness / outcome / volume_regime / pair_correlation / multi_tf_agreement), modulated final confidence, asset_class, exchange, timestamp.
2. **Signal-evaluation archive** — every signal evaluation (admit + reject), every strategy, every pair, with **all feature inputs** at evaluation time. For rejects: which gate fired (SQE / RTB / TCL / strategy-internal) + reject reason.
3. **Exit-decision archive** — every exit decision (BE_stop / SL_hit / TP_target_hit / TRAIL_hit / time-stop / regime-flip), with full state snapshot at exit: ATR at exit, distance from entry, R-multiple, time-in-trade, regime/DBS at exit vs at entry. (B73 already has counterfactual exit-strategy rows; this is the **actual** exit decision, parallel.)
4. **Macro-feed archive** — B67.1 macro feed (btc_dom, mcap_mom, funding) at scan cadence so feature joins by timestamp are lossless. Currently feed is in-process rolling window only; persisting per-cycle snapshots makes it joinable.
5. **B62 retroactive re-labeling** — re-run B62-current classifier over Mar 6 – Apr 16 OHLC archives, produce a new `regime_label_b62_post_audit` column on a derived view; original labels preserved.
6. **Storage formats queryable without retrofit** — Postgres tables for live querying + nightly Parquet export to a local archive directory (or S3 if Kyle approves cost). Parquet schema is the natural format for tsfresh / Qlib.
7. **Asset-class-uniform** — every new table inherits B69 schema (asset_class + exchange columns).

## Non-goals

- **The Trend Mining Engine itself** — Phase 17.6 / 18.5 post-launch.
- **ML-light** — separate batch B75 post-calibration.
- **Cold-storage tier-down** (passive archive aging-off / S3 migration) — adjacent but separate; explicit follow-up batch if disk pressure warrants.
- **Live-trading capture** — live mode is not yet active; design must accommodate it but B70 ships against VTS + paper-sim today. When live trading turns on (post-Phase-19), the same archiver feeds it with no schema changes.
- **Backfilling B70 archive tables from before this batch** — except for B62 re-labeling, B70 is forward-only. Rationale: the per-pair scan-state archive is a new data product that didn't exist pre-B70; trying to reconstruct it from logs would be lossy and slow.

---

## §A. Numbered Objectives

### A.1 New tables (per-batch deliverable)

| Table | Contents | Cadence | Asset-class-aware |
|---|---|---|---|
| `pair_scan_archive` | per-pair × per-cycle scan state with feature snapshot + modulator chain | 60s (one row per scanned pair per MCE cycle) | yes |
| `signal_eval_archive` | per-strategy × per-pair signal evaluation (admit + reject), feature inputs, gate decision | per-evaluation (typically same cadence as scan) | yes |
| `exit_decision_archive` | actual exit decision per closed trade with full state snapshot | per-trade-close | yes |
| `macro_feed_archive` | B67.1 macro snapshot timeseries | 60s | n/a (global) |
| `b62_retroactive_labels` | re-derived B62-post-audit regime labels for Mar 6 – Apr 16 VTS trades | one-time backfill | yes |

All tables: `id` PK, `timestamp` (indexed), `asset_class`, `exchange`, partitioned by month following B74 pattern.

### A.2 Archiver service module (`server/services/data-archive/`)

New service directory mirroring `server/services/passive-archive/` (B74). Components:

- `pair-scan-archiver.ts` — hooks into MCE post-classification; one row per pair per cycle.
- `signal-eval-archiver.ts` — hooks into signal-orchestrator + VTS-runner emit points; one row per strategy × pair evaluation.
- `exit-decision-archiver.ts` — hooks into paper-execution-engine + VTS-runner exit paths; one row per close.
- `macro-feed-archiver.ts` — hooks into external-macro-feed.ts post-fetch; one row per cycle.
- `archive-batch-writer.ts` — shared 5s-flush batched insert with bounded in-memory queue (mirror B74 pattern).
- `b62-relabel-runner.ts` — one-shot script for retroactive re-labeling.
- `parquet-exporter.ts` — nightly cron, exports prior day's rows from each archive table to `/var/lib/dawntrader/parquet/<table>/<YYYY-MM-DD>.parquet`.

### A.3 Schema design — feature columns

To support the Trend Mining Engine's "all 30+ features" requirement without ballooning column count, **structured JSONB columns** for the heavy stuff:

- `features JSONB` — map of all feature inputs at evaluation time (regime indicators + strategy-specific). Versioned by `features_schema_version` column.
- `modulators JSONB` — map of all 7 modulator inputs + their weights + the resulting modulated confidence.
- `gate_decision JSONB` (signal_eval only) — `{gate: 'SQE'|'RTB'|'TCL'|'strategy_internal', accepted: bool, reason: string, threshold_value: number, observed_value: number}`.

**Why JSONB not flat columns:** tsfresh / Featuretools work fine on JSONB-extracted features at training time; flattening 30+ features × 4 archive tables would create maintenance debt every time a feature is added. Postgres GIN indexes on JSONB keep filtering fast.

### A.4 B62 retroactive re-labeling (Option B)

- Read VTS trades closed Mar 6 – Apr 16 from existing JSON logs.
- Re-derive regime label using current B62-post-audit classifier (`server/core/metrics/market-regime.ts`) + current DBS + current TFS desaturation. Use OHLC from `crypto_spot_ohlc_1m` (B74) for the entry-time regime context.
- Write `b62_retroactive_labels` rows: `(trade_id, original_label, retroactive_label, label_diff_flag, classifier_version_original, classifier_version_retroactive, label_timestamp)`.
- Diff report: count + percent of trades where label changed, broken down by original→retroactive transition matrix.

### A.5 Storage budget + retention

- Postgres rows kept for 90 days online (rolling window, partition drop). Parquet kept indefinitely.
- Estimated row volume per day (rough order):
  - `pair_scan_archive` — 380 pairs × 1440 cycles/day = ~547k rows/day
  - `signal_eval_archive` — ~547k pair-cycles × ~17 strategies = ~9M rows/day (if every strategy evaluates every pair every cycle; in practice probably 1-3M after pre-filter gates)
  - `exit_decision_archive` — ~50-300 rows/day
  - `macro_feed_archive` — 1440 rows/day
- Disk: estimate after pre-audit measurement. If over 50 GB/month projected, pre-audit must propose a lighter-touch alternative (e.g., signal_eval_archive only on top-N candidates after pre-filter).

### A.6 Wiring

- MCE post-classification hook → `pair-scan-archiver`.
- signal-orchestrator + vts-runner per-evaluation emit → `signal-eval-archiver`.
- paper-execution-engine + vts-runner exit paths → `exit-decision-archiver`.
- external-macro-feed post-fetch → `macro-feed-archiver`.
- All archiver writes go through `archive-batch-writer` with 5s flush. Failure mode: log + drop, never block the live path.

### A.7 Drizzle migrations

- Single migration file: `2026-05-XX-b70-data-archive-tables.sql` + matching rollback.
- Tables, indexes (timestamp, pair_id, asset_class), GIN on JSONB feature columns.
- B62 retroactive labels: separate one-shot SQL after table creation.

### A.8 Module constants

New `data_archive` module in `module_constants`:

| Key | Default | What it controls |
|---|---|---|
| `b70_pair_scan_capture_enabled` | `true` | Master toggle |
| `b70_signal_eval_capture_enabled` | `true` | Heaviest stream — emergency disable |
| `b70_exit_decision_capture_enabled` | `true` | Trade-close hook |
| `b70_macro_feed_capture_enabled` | `true` | Macro snapshot |
| `b70_parquet_export_enabled` | `false` | Off until A.10 verified |
| `b70_partition_lookhead_months` | `2` | Mirror B74 |
| `b70_postgres_retention_days` | `90` | Online retention |

### A.9 Tests

- Unit tests on each archiver — given a synthetic event, verifies a row with correct shape lands in the queue.
- Integration test on full pipeline: spin up a synthetic MCE cycle, run a signal evaluation, close a trade — verify rows in all four tables with correct timestamps and joinable by `(timestamp, pair, asset_class)`.
- B62 re-label runner: dry-run mode that prints the diff matrix without writing.

### A.10 Verification + UI surfacing

- Drift Dashboard tab gets a new `DataArchiveSection` panel showing: rows-per-day per table, last-write timestamp, queue depth, error count. Mirrors B74 PassiveArchiveSection.
- Dedicated `/api/analytics/data-archive-status` endpoint.

### A.11 Parquet export (deferred-default)

- Nightly cron at 03:00 UTC (offset from 04:00 replay-ablation cron).
- Writes to `/var/lib/dawntrader/parquet/<table>/<YYYY-MM-DD>.parquet`.
- Uses `parquetjs-lite` or similar Node Parquet lib (verify license + maintenance in pre-audit).
- Off by default (`b70_parquet_export_enabled=false`); turn on after Postgres-side capture proven for 7 days.

---

## §B. Open Questions for Langston

**B.1** Signal-eval row volume — 9M rows/day is the upper bound. Should we cap at top-N candidates after pre-filter (post-SQE)? Or capture every evaluation including pre-filter rejects? **My recommendation:** capture every evaluation including rejects, BUT every reject row carries a `reject_stage` enum (`pre_filter` | `sqe` | `rtb` | `tcl` | `strategy_internal`) so downstream queries can cheaply restrict to admitted-and-scored if 9M/day proves unwieldy. Disk pressure managed via 90-day retention + Parquet offload.

**B.2** JSONB vs flat columns — flat columns are faster to query and cheaper to index, but every feature addition needs a migration. JSONB is more flexible for the Trend Mining Engine's "candidate features" use case. **My recommendation:** JSONB for `features` + `modulators` + `gate_decision`; flat columns for the regime/DBS basics that 80% of queries will use (`regime_label`, `dbs`, `dbs_category`, `confidence_modulated`, `atr_pct`).

**B.3** Parquet exporter library choice — Node ecosystem options are limited. `parquetjs-lite` is unmaintained but works; `apache-arrow` Node bindings work but heavy. **My recommendation:** start with `parquetjs-lite` (sufficient for dump-and-go); switch to Arrow only if streaming performance becomes a bottleneck. Or: use `pg_parquet` extension on the Supabase side if available; falls back to a Python sidecar script if not.

**B.4** B62 retroactive re-labeling — Mar 6 is before B74 archive started (Apr 30). For the Mar 6 – Apr 30 window we don't have OHLC in `crypto_spot_ohlc_1m`. Two options: (a) defer re-labeling to the Apr 30 → present window only (use B74 OHLC); (b) use existing `vts_eval_history` snapshots which capture entry-time indicator state — sufficient for regime re-labeling without a full OHLC pull. **My recommendation:** (b). The regime classifier inputs (mom, ADX, volume ratio, ATR%) are what get persisted in vts_eval_history; we don't need raw OHLC to re-label, only to re-derive the inputs. Faster and works on the full Mar 6 – Apr 16 window.

**B.5** Should `pair_scan_archive` also include scan-stage rejection reason for pairs that DIDN'T get into signal evaluation (e.g., spread too wide, volume below floor)? **My recommendation:** yes — `scan_stage_decision JSONB` column on every row capturing whether the pair passed pre-filter to signal eval, and if not, why. This is exactly the "pair-level scan capture: every cycle, every pair, including rejects with reason" goal from MEMORY.

**B.6** Live-trading capture — same archiver hits paper-execution-engine today, will hit live-execution-engine post-Phase-19. Should `exit_decision_archive` carry a `mode` column (`vts` | `paper_sim` | `live`) so all three execution paths land in the same table? **My recommendation:** yes — single table with `mode` column avoids triplicating the schema. Cleaner queries, single dashboard panel.

---

## §M. Mode-agnostic capture (Kyle directive 2026-05-04, mid-Step-2)

**Design property:** every archiver MUST accept data from whichever execution path is running — active trading (live), paper-sim, or VTS passive learning — and switch seamlessly as paths switch. **No code change required when modes flip.**

Concretely:
1. **All 5 archive tables get TWO discriminator columns** (Langston refinement cc-inbox #896, 2026-05-04):
   - `mode` (system-wide, from `getCurrentMode()` accessor) — what operational state was the system in when this row was written? Lifecycle continuity field.
   - `source` (per-hook, hardcoded at the call site) — which code path produced this row? Per-row attribution field. Decouples hook origin from system mode for the VTS-always-on edge case where VTS and paper-sim could run concurrently.
   - Today these are equivalent (only VTS is active). They diverge once paper-sim activates alongside VTS or when live activates. Adding both at table creation time is trivial; retrofitting one later is not.
2. **Hooks must exist in all three execution paths,** even paths currently dormant:
   - `signal-orchestrator.ts` (active live trading — dormant) → emits with `mode='live'` when activated
   - `paper-execution-engine.ts` (paper-sim — dormant for active trading, will activate Phase 19) → emits with `mode='paper_sim'`
   - `vts-runner.ts` (VTS passive learning — currently active) → emits with `mode='vts'`
3. **Mutually exclusive but coexisting:** at a given moment exactly one of {VTS, paper-sim, live} is the dominant mode per the run-mode controller. The archiver code path is identical across modes; the `mode` value is read once per emit from a `getCurrentMode()` accessor — NOT hardcoded per-hook.
4. **Path switches are transparent:** when VTS turns off and paper-sim turns on, the archiver continues writing rows; only the `mode` column value changes. Downstream queries filter or group by `mode` as needed.
5. **MCE caveat:** MCE runs in all three modes (path-shared). Its hook fires regardless; the `mode` column still tags which execution path was consuming MCE at that cycle.

**Mode resolution source of truth:** `getCurrentMode()` accessor exported from a single module. Step 3.0 identifies whether one already exists (likely `server/services/trading-mode.ts` or boot-orchestrator) or creates one as a thin wrapper. Archivers MUST NOT have their own mode logic.

**Rationale:** path-specific archive design forces a code change + redeploy on every mode transition. The `mode` column makes the archive a continuous log across the full lifecycle — VTS data today, paper-sim data Phase 19, live data Phase 21 — all in the same tables, queryable across transition boundaries.

---

---

## §B-refinements (Langston cc-inbox #893)

**D.1 Row-volume governance — batched 90-day sweep.** The retention sweep MUST run as a dedicated cron with batched DELETEs (10k rows + `pg_sleep(0.1)` between iterations) — never a single bulk `DELETE FROM ... WHERE created_at < NOW() - INTERVAL '90 days'`, which would blow up WAL. Steady-state row count expectations to publish in §A.5 of the pre-audit:
- `pair_scan_archive` — ~547k/day × 90d ≈ **49M rows steady-state**
- `signal_eval_archive` — see D.2 below
- `exit_decision_archive` — ~50–300/day × 90d ≈ **~5–27k rows**
- `macro_feed_archive` — 1440/day × 90d ≈ **130k rows**

**D.2 signal_eval_archive volume sanity-check.** Langston caveat: if full-capture-with-stage-tag pushes table to ~26M+ rows, consider v1 capturing only post-SQE evals + v2 adding pre-filter rejects. **Decision deferred to pre-audit measurement** — pre-audit will instrument a 1-hour sample to count actual eval rate and project 90d steady state. If projection > 80M rows, fall back to v1 post-SQE-only with a follow-up batch for pre-filter capture.

**D.3 Schema versioning inside JSONB.** Every JSONB column (`features`, `modulators`, `gate_decision`, `scan_stage_decision`) MUST embed a `schema_version: <int>` field inside the blob. When the chain adds/removes modulators (e.g., B67.5 consumer wiring changes semantics), downstream analysis code branches on version. Without this, retroactive cross-version queries become a guessing game. Bump version on every breaking change to the JSONB shape.

---

## §C. Verification criteria (Step 7 outcomes-based green)

A batch is GREEN when every check below passes against staging:

1. ✅ All four archive tables exist with B69 asset_class + exchange columns.
2. ✅ `pair_scan_archive` accumulating rows at ~547k/day rate (verify via 1-hour sample × 24).
3. ✅ `signal_eval_archive` accumulating rows; reject_stage breakdown shows non-zero counts for at least 3 stages.
4. ✅ `exit_decision_archive` accumulating rows on every closed VTS / paper-sim trade.
5. ✅ `macro_feed_archive` accumulating one row per minute, joinable by timestamp to other tables.
6. ✅ B62 re-label runner produces a non-empty diff matrix; counts published in completion report.
7. ✅ Drift Dashboard `DataArchiveSection` panel renders live with green status indicators.
8. ✅ All 4 CI checks green; deploy after Test Suite + Build + Docker Build per Kyle directive 2026-05-04.

---

## §D. Workflow

Standard 11-step. **SIM consultation MANDATORY in Step 2** per Kyle directive 2026-05-03 — every component touched (MCE, signal-orchestrator, VTS-runner, paper-execution-engine, external-macro-feed, B74 archiver, Drift Dashboard) gets upstream/downstream/shared-state/blast-radius analysis written into `BATCH_70_PRE_AUDIT.md`.

Mini-batch streamlining is NOT applicable — B70 surface is large (5 tables, 5 archivers, B62 runner, Parquet exporter, UI panel).

---

## §E. Rollback plan

- `2026-05-XX-b70-data-archive-tables.rollback.sql` drops all 5 tables.
- All archiver hooks gated by `module_constants` toggles (A.8) — flip to `false` to stop writes without redeploy.
- Parquet exporter can be paused independently.
- B62 re-labeled rows are derived data; safe to drop and re-run.

---

*End of BATCH_70_SCOPE.md draft.*
