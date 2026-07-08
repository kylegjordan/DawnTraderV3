# DawnTrader — Storage & Retention Policy (canonical reference)

> **Purpose (Kyle directive 2026-07-08).** The single canonical statement of how DawnTrader stores, tiers, retains, and preserves data. The System Manual + SYSTEM_IMPACT_MAP describe the *implementation*; THIS file is the *policy* — the rules, retention windows, and the hot→warm→cold path — kept separately so it can be referenced without digging through architecture docs. If policy and implementation ever disagree, that's a bug — reconcile them.
>
> **Governing directive (Kyle 2026-05-06):** *"We don't ever drop data, especially not now when we're not sure what data is going to be valuable and when."* Every retention boundary is **move-not-delete** — data moves to progressively cheaper storage as it ages; it is **never deleted** (the two documented exceptions are small derived-telemetry tables, below).

---

## 1. The three tiers

| Tier | Where | Retrieval speed | Cost / GB-month | Role |
|---|---|---|---|---|
| **HOT** | Supabase Postgres disk (live SQL) | milliseconds | ~$0.125 | queryable by the live system |
| **WARM** | Supabase Storage (`dt-archive` bucket, JSONL.gz) | seconds | ~$0.021 | recent-history, fast to rehydrate |
| **COLD** | Backblaze B2 (`dt-archive-cold` bucket, JSONL.gz) | seconds | ~$0.006 | **indefinite — never deleted** |

Data flows **one direction only: HOT → WARM → COLD.** At each boundary the object is exported, uploaded, **download-verified (checksum match)**, and only then removed from the tier above — so a crash can never lose data. The `data_archive_manifest` table is the single source of truth for "what exists, in which tier, where."

## 2. The lifecycle path (how long in each tier)

- **HOT for the table's `hot_retention_days`** (see §3), then the month's (or day's) partition is moved to WARM.
- **WARM for `default_warm_retention_days` = 365 days** (from when it landed in warm), then moved to COLD.
- **COLD indefinitely** — the permanent keep-forever archive; nothing is ever removed.

So a given day's data (for a 90-day-hot table) lives: ~90 days HOT → the following ~365 days WARM → COLD forever after (~15 months after creation it reaches cold). **Nothing is deleted at any hop.**

**Rehydration:** any archived data is retrievable via `b75-rehydrate.ts` (warm = fast, cold = slightly slower). The manifest tells the rehydrator where each partition lives.

## 3. Per-table retention (`module_constants.data_lifecycle`)

| Table(s) | Kind | HOT retention | Then |
|---|---|---|---|
| `xstock_spot_ticker_snap`, `xstock_perp_ticker_snap`, `crypto_spot_ticker_snap` | bid/ask quote stream | **30 d** | WARM → COLD |
| `xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m` | 1-minute price bars | **365 d** | WARM → COLD |
| `signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance` (the 5 B70 analytics tables) | trading-analysis records | **90 d** | WARM → COLD *(B-STORAGE-HARDEN Wave C, 2026-07-08 — previously DROP-only, now preserved)* |
| `context_bridge_log` | dev/telemetry | 14 d | WARM → COLD |
| `warm objects (all)` | — | (n/a) | **365 d in WARM** → COLD |

**The two documented delete-exceptions** (small derived-telemetry, not preservation-worthy — explicitly allowed to delete):
- `xstock_qd_probe_history` — batched age-DELETE + VACUUM at its retention (no cold-offload).
- `context_bridge_log`'s in-hot TTL portion + `amr_decision_ledger` (90-day in-service prune, deliberately not swept — the shadow-week evidence substrate).

## 4. What preserves the data (the machinery)

- **`b75-retention-sweep.ts`** (cron `15 2 * * *`): the single retention owner. Exports each eligible HOT partition → WARM (export → upload → download-verify → DROP-only-after-verify), with adaptive per-day slicing for large partitions + an O_EXCL run-lock so a long pass can't overlap. Covers the B74 market-data tables **and** (since Wave C) the 5 B70 analytics tables.
- **`b75-cold-rotator.ts`** (cron `0 3 1 * *`): table-agnostic WARM → COLD rotation at 365 d; stamps `verified_at` after a re-download checksum match.
- **`b75-cold-liveness.ts`** (cron `0 4 * * 1`): weekly cold round-trip canary — a dead-key detector so the cold credentials can't silently rot between real rotations.
- **`b-storage-archival-health.ts`** (cron `0 5 * * *`): watchdog that fires a §10.5 alert if any sweep goes stale or reports failures.
- **`database-monitor.ts`** (in-app, 24h): fires a §10.5 alert when logical DB size crosses 65% (warning) / 80% (critical) of the 200 GB Supabase plan cap.
- **`b70-create-monthly-partitions.ts`** (cron `30 2 28 * *`) + `b74-create-monthly-partitions.ts`: pre-create forward partitions.

**Retired / paused (do not resurrect):** `b70-retention-sweep.ts` was **DELETED** (B-STORAGE-HARDEN Wave C, rule 18) — it was DROP-only and violated the never-drop directive; the B70 tables now tier through the B75 sweep instead.

## 5. Capacity + the disk ceiling

- Supabase Pro disk **auto-expands** at ~90% usage (+50% per step) and **never shrinks**; the practical auto-expand ceiling is **200 GB** (`database_monitor.plan_cap_mb = 204800`). Logical data is measured against this cap; the tiering keeps hot data moving off so logical size stays well under it.
- The #1 hot consumer is `xstock_spot_ticker_snap` (~63 GB/mo at the pre-Wave-D 1-tick/~1.8s capture) — being reduced ~5–6× in Wave D by slowing the quote-snapshot cadence (NOT the price bars; see §6).

## 6. Important distinctions (avoid these traps)

- **Quote snapshots ≠ price bars.** `xstock_spot_ticker_snap` is the raw bid/ask *quote* stream (feeds spread, order-book depth, price-freshness). The strategies' **decision bars (15-min / 60-min / 240-min) are rolled up from `xstock_spot_ohlc_1m`** (a separate WebSocket-fed 1-minute table). Reducing quote-snapshot capture does NOT affect the decision bars.
- **The 15-second freshness gate ≠ the 15-minute decision bar.** `xstock_fill_safety.active_fill_max_age_ms = 15000` (15 s) is how fresh the *latest quote* must be for an active fill. The 15-minute bar is the *evaluation timeframe*. Unrelated.
- **Freshness gates are per-asset-class** (`fill_depth_gate.warmth_max_age_ms`: crypto_spot = 5 s, xstock_spot = 15 s — resolved most-specific-wins; NOT a duplicate).

## 7. Tunable knobs (all DB-governed, no code change)

- Per-table HOT window: `data_lifecycle.<table>.hot_retention_days`.
- WARM→COLD window: `data_lifecycle.default_warm_retention_days` (global today; **can be made per-table if we want a table to reach cold sooner** — e.g. sending a rarely-re-read table straight-ish to cold. Cost delta is pennies; the reason to keep a warm window is faster rehydrate for re-analysis/calibration).
- Capture cadence (xStock/crypto ticker): `passive_archive.b74_ticker_snapshot_min_interval_ms`.
- Disk alarm thresholds: `database_monitor.{plan_cap_mb, warning_threshold_pct, critical_threshold_pct}`.

## 8. Change log (policy-level)
- **2026-05-06 (B75):** tiered hot/warm/cold + the never-drop directive established.
- **2026-07-08 (B-STORAGE-HARDEN Wave A):** cold tier activated + archival-health/disk alarms wired.
- **2026-07-08 (Wave C):** the 5 B70 analytics tables moved from DROP-only to hot→warm→cold tiering (#430); `b70-retention-sweep` deleted.
- **2026-07-08 (Wave D, in progress):** xStock quote-snapshot capture cadence reduced (~5–6×) + rolling-30-day retention via daily partitioning for `xstock_spot_ticker_snap`.

> Maintained alongside the B-STORAGE-HARDEN batch + any future storage/retention change. Update this file whenever a retention window, tier boundary, tunable, or the machinery changes.
