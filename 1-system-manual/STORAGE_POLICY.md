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
| `xstock_spot_ticker_snap` | bid/ask quote stream (**DAILY-partitioned** from 2026-08-01 — true rolling-30 hot window; Wave D OBJ-3) | **30 d** | WARM → COLD |
| `xstock_perp_ticker_snap`, `crypto_spot_ticker_snap` | bid/ask quote stream (monthly-partitioned) | **30 d** | WARM → COLD |
| `xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m` | 1-minute price bars | **365 d** | WARM → COLD |
| `signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance` (the 5 B70 analytics tables) | trading-analysis records | **90 d** | WARM → COLD *(B-STORAGE-HARDEN Wave C, 2026-07-08 — previously DROP-only, now preserved)* |
| `switch_on_shadow_evidence` (B-EVIDENCE-SINK, 2026-07-14) | the 3 switch-on behavioral proofs extracted from rotating stdout (FINALSCORE_SHADOW verdict / EV_REJECT rate-numerator / maker-taker pick+haircut snapshot; §5.5) — proof_type-discriminated | **90 d** | WARM → COLD *(registered in the b75 sweep + b70 partition self-heal like its B70 siblings)* |
| `context_bridge_log` | dev/telemetry | 14 d | WARM → COLD |
| `warm objects (all)` | — | (n/a) | **365 d in WARM** → COLD |

**The two documented delete-exceptions** (small derived-telemetry, not preservation-worthy — explicitly allowed to delete):
- `xstock_qd_probe_history` — batched age-DELETE + VACUUM at its retention (no cold-offload).
- `context_bridge_log`'s in-hot TTL portion + `amr_decision_ledger` (90-day in-service prune, deliberately not swept — the shadow-week evidence substrate).

## 4. What preserves the data (the machinery)

- **`b75-retention-sweep.ts`** (cron `15 2 * * *`): the single retention owner. Exports each eligible HOT partition → WARM (export → upload → download-verify → DROP-only-after-verify), with adaptive per-day slicing for large partitions + an O_EXCL run-lock so a long pass can't overlap. Covers the B74 market-data tables **and** (since Wave C) the 5 B70 analytics tables.
- **`b75-cold-rotator.ts`** (cron `0 3 1 * *`): table-agnostic WARM → COLD rotation at 365 d; stamps `verified_at` after a re-download checksum match.
- **`b75-cold-liveness.ts`** (cron `0 4 * * 1`): weekly cold round-trip canary — a dead-key detector so the cold credentials can't silently rot between real rotations.
- **`b-storage-archival-health.ts`** (cron `0 5 * * *`): watchdog that fires a §10.5 alert if any sweep goes stale or reports failures — and (Wave D) a daily-partition **forward-coverage check** that alerts if the furthest-provisioned daily partition is < 4 days ahead (or none exist at/after cutover). Runs in its own process so a dead daily creator can't vouch for itself.
- **`b74-create-daily-partitions.ts`** (cron `0 1 * * *`, Wave D): pre-creates `xstock_spot_ticker_snap_YYYY_MM_DD` daily partitions for a 14-day forward window (self-heals the current day; skips pre-cutover days). The monthly creator (`b74-create-monthly-partitions.ts`) EXCLUDES the daily-partitioned table at/after the 2026-08-01 cutover so the two never overlap.
- **`database-monitor.ts`** (in-app, 24h): fires a §10.5 alert when logical DB size crosses 65% (warning) / 80% (critical) of the 200 GB Supabase plan cap.
- **`b70-create-monthly-partitions.ts`** (cron `30 2 28 * *`) + `b74-create-monthly-partitions.ts`: pre-create forward partitions.

**Retired / paused (do not resurrect):** `b70-retention-sweep.ts` was **DELETED** (B-STORAGE-HARDEN Wave C, rule 18) — it was DROP-only and violated the never-drop directive; the B70 tables now tier through the B75 sweep instead.

## 5. Capacity + the disk ceiling

- Supabase Pro disk **auto-expands** at ~90% usage (+50% per step) and **never shrinks**; the practical auto-expand ceiling is **200 GB** (`database_monitor.plan_cap_mb = 204800`). Logical data is measured against this cap; the tiering keeps hot data moving off so logical size stays well under it.
- The #1 hot consumer is `xstock_spot_ticker_snap` (~63 GB/mo at the pre-Wave-D 1-tick/~1.8s capture) — reduced in Wave D two ways: OBJ-3's rolling-30 daily partitioning (~2× structural) + OBJ-4's slower quote-snapshot cadence (4000 ms ≈ ~3×), ~6× combined. This slows the quote SNAPSHOTS, NOT the price bars (see §6).

## 5.5 Operational logs — ROTATE-and-discard, NOT tiered (the ONE deliberate exception to never-drop, and why)

**The never-drop / move-not-delete directive governs BUSINESS DATA** (signals, provenance, trades, market-data tables) — the data whose future value we can't yet predict. It does **NOT** govern **operational process logs** (the app's pm2 stdout/stderr: `health_engine latency=1ms`, event-loop metrics, broadcast lines, debug traces). Those are operational noise, not analysable business data, and the correct universal policy for them is **rotate-and-discard**, not cold-archive — archiving gigabytes of `latency=1ms` lines to cold storage forever would spend the tiering machinery (and disk) on noise.

- **Machinery (added B-OPS-PM2-LOG #499, 2026-07-13):** `pm2-logrotate` on the deploy-owned pm2 governs `/var/log/dawntrader/{out,error}.log` — **`max_size 1G` → rotate (lossless rename + reloadLogs), `retain 14`, `compress`, oldest discarded, 30s size-poll.** Bounded, self-managing; replaced an ungoverned 22.4 GB unrotated `out.log` (the exact "never trimmed / never archived" failure). This is a GOVERNED retention stream now, not an accumulator.
- **The valuable signals INSIDE the log stream are NOT discarded** — they are EXTRACTED to a dedicated durable store that the rotator never reaps: the **switch-on behavioral evidence** (FINALSCORE_SHADOW verdicts, EV_REJECT rate, maker-pick-rate) lands in a dedicated evidence sink — the **`switch_on_shadow_evidence` table (B-EVIDENCE-SINK, 2026-07-14, §3)**, retained 90d-hot then tiered — which the rotator never reaps. Rotation discards the operational firehose; the extracted evidence persists. So "valuable → retained, noise → rotated" holds at the line level, not just the file level.
- **Rule of thumb:** if it's a structured record you might re-analyse or calibrate from → a DB table under §3 (never-drop, tiered). If it's process/debug console output → rotate-and-discard here. When a log line turns out to be evidence, route it to a table/sink (never leave it only in the rotated firehose).

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
- **2026-07-08 (Wave D — OBJ-3 LANDED):** `xstock_spot_ticker_snap` transitioned from MONTHLY to DAILY RANGE partitions at a 2026-08-01 month-boundary cutover (transition-forward — the ~63 GB live table is never repartitioned; July + earlier stay monthly and age out) so the hot window is reclaimable one DAY at a time (true rolling ~30 d) instead of whole months. New daily partition creator (`b74-create-daily-partitions.ts`, cron `0 1 * * *`, 14-day look-ahead); the monthly creator excludes the table at/after cutover; the retention sweep parses daily-first; an independent forward-coverage watchdog alerts if the runway thins. Bounded proof: a synthetic daily partition tiered hot→warm→drop-after-verify. Also fixed #438 (the b74 creators' missing `dotenv` — the monthly creator cron had been silently failing). **OBJ-4 (capture cadence, `b74_ticker_snapshot_min_interval_ms`): flipped + live-measured per-symbol during RTH; crew-consensus value = 4000 ms (~1 capture/4.3 s, ~3× cut — 8000 was measured but pushed 61 genuine symbols past the 15 s freshness gate vs 4000's 10, so it was stepped down). Combined with OBJ-3's rolling-30, ~6× total hot reduction. Throttle is bootstrap-cached → a change needs an app restart. ✅ Kyle CONFIRMED 4000 (2026-07-08), conditioned on a weekly opportunity-loss monitor (B-XSTOCK-FRESHNESS-MONITOR). The ~10 freshness-affected names are mid/high-volume tokens with occasional native tail-pauses (fresh on median), NOT thin tokens; new thin listings are gated by native slowness at any cadence (#440), not by this setting.**

> Maintained alongside the B-STORAGE-HARDEN batch + any future storage/retention change. Update this file whenever a retention window, tier boundary, tunable, or the machinery changes.

---

## 9. ★★ THE CATALOGUE — WHAT IS STORED, AND WHETHER IT IS ACTUALLY SWEPT (`B-STORAGE-CATALOG` part 1, 2026-07-28, CC-A)

> **Kyle's directive:** *"we need to catalog everything that we're storing and where it can be found."* **Measured at the read sites, not inherited.** Registries: `server/scripts/b75-retention-sweep.ts` (`B74_TABLES` / `B70_TABLES` / `PLAIN_RETENTION_TABLES`); tiering ground-truth: the `data_archive_manifest` table; windows: `module_constants.data_lifecycle.*` (31 rows, read live).

### ★★ THE RULE THIS CATALOGUE EXISTS TO MAKE UNMISSABLE
**A RETENTION KEY IS NOT TIERING. THEY ARE TWO SEPARATE ACTS.** A table can hold a perfectly good `hot_retention_days` (or equivalent) **and still be registered in NO sweep** — in which case the key describes an intention nobody executes, or worse, a DELETE that no archive precedes. **⇒ To answer "is X safe?", check BOTH: (a) does it have a window, and (b) is its name in one of the three registries below.** Answering only (a) is the trap that produced the trade-record finding.

### A. ARCHIVED **then** dropped — safe (12 tables)
**Market data (`B74_TABLES`)** — partitioned, exported to warm, verified, then dropped:
`xstock_spot_ticker_snap` (30 d) · `xstock_perp_ticker_snap` (30 d) · `crypto_spot_ticker_snap` (30 d) · `xstock_spot_ohlc_1m` (365 d) · `xstock_perp_ohlc_1m` (365 d) · `crypto_spot_ohlc_1m` (365 d)
**Analytics (`B70_TABLES`)** — same export→warm→verify→drop path (moved off DROP-only at Wave C, #430):
`signal_eval_archive` (90 d) · `pair_scan_archive` (90 d) · `exit_decision_archive` (90 d) · `macro_feed_archive` (90 d) · `signal_eval_provenance` (90 d) · `switch_on_shadow_evidence` (90 d)

### B. DELETED with **no** archive step (1 table)
`xstock_qd_probe_history` (90 d) — `PLAIN_RETENTION_TABLES`: a batched age-`DELETE` + `VACUUM`, **no export**. Deliberate (a small derived-telemetry table not worth partitioning) — **recorded here so it is a known, chosen loss rather than a discovered one.**

### C. ★★ DELETED BY A **SEPARATE** MECHANISM THE SWEEP DOES NOT KNOW ABOUT — the live risk
**`vts_open_trades` — 90 d, HARD DELETE, NO ARCHIVE, and it is in NONE of the three registries above.**
- Mechanism: `vts-trade-persistence.ts sweepClosedOpenTrades()` — `DELETE FROM vts_open_trades WHERE closed = true AND closed_at < NOW() - retentionDays`, window `data_lifecycle.vts_open_trades.closed_gc_retention_days` = **90** (read live).
- ★ **It runs at BOOT** (called from `server/index.ts` after rehydrate) — and with **537 process restarts**, boot is frequent, so this is not a once-a-month job.
- ★★ **NOTHING HAS BEEN LOST YET — measured, not assumed:** every logged run reports **`swept=0`** (`[B79.0g-tx][GC_SWEEP] retention=90d swept=0`, sampled across 2026-07-27→28). Oldest surviving row is **2026-05-11**, and DB persistence itself began at the `2026-05-10-b79-0g-vts-open-trades.sql` migration — **so 05-11 is a START date, not a retention edge.**
- ⚠️ **FIRST IRREVERSIBLE LOSS ≈ 2026-08-09.** **The OUTCOME survives** (`exit_decision_archive` carries `pnl_pct` + `r_multiple` at 100%, warm **and** cold). **What dies is the ENTRY SIDE + the join key:** `position_size`, `quantity`, `stop_loss`, `take_profit`, `signal_type`, `pool`, `chosen_entry_mode`, `entry_fee_rate`, `maker_limit_price`, `maker_deadline`, `calibration_state`, `opened_at`, raw `context`.
- **Langston's scoping steer (adopt it — it makes the fix small):** protect the fields with a **NAMED CONSUMER**, not everything that disappears. Named: `chosen_entry_mode` + `entry_fee_rate` (**★ THE maker-vs-taker entry-policy record — these two are the genuinely unrecoverable pair; nothing else preserves them for the VTS corpus**) and the `pool` tag. ⚠️ **CORRECTED 2026-07-30 (Langston Step-4): an earlier version of this sentence credited `maker_limit_price` with that work. IT DOES NOT DO IT — `maker_limit_price` is a COPY of `entry_price` (both writers set `makerLimitPrice: entryPrice`; a maker fills AT its limit and `entry_price` is never rewritten), and `entry_price` is already archived, so it is RECOVERABLE. It is retained only to keep the archived row self-contained and as a coherence check if a future writer ever diverges limit from entry. `maker_deadline` IS unrecoverable — it is `openedAt + resolveMakerMaxPendingMs()` and that knob is tunable, so once it moves the patience budget an order worked under is gone.** Sizing ranks lower: `netPnl`/`r_multiple`/`dollarValue` survive, so outcomes reconstruct without `position_size`.

### D. Its own TTL, outside the sweep
`context_bridge_log` (14 d) — `context-bridge-log-ttl.ts`. **Is** tiered (present in the manifest, warm **and** cold).

### E. ⚠️ REGISTERED ≠ EXERCISED — read the manifest before believing coverage
The `data_archive_manifest` holds **72 objects across only 5 distinct source tables**: `context_bridge_log`, `crypto_spot_ticker_snap`, `exit_decision_archive`, `xstock_perp_ticker_snap`, `xstock_spot_ticker_snap`. **⇒ 8 of the 12 registered tables have never produced an archive object.** **NOT asserted as a defect** — the benign explanation fits (a table only produces an object once a partition ages past its window; the `_ohlc_1m` set is on 365 d and the analytics set on 90 d, and several are younger than that). **But it is the difference between "configured" and "proven", and only the manifest can tell you which you have.** ★ **Anyone claiming a table is safely tiered should cite a manifest row, not a config key.**

### F. NON-TABLE STORES — log directories, file stores and state files (catalogue part 1, remainder, 2026-07-28)

⚠️ **FIRST, A DISTINCTION THAT MUST NOT BE BLURRED: these live on the STAGING BOX filesystem. They have NOTHING to do with the `Database disk CRITICAL: 81.4% of 200 GB plan cap` alert, which is the Supabase DB.** Two different disks, two different risks. **Measured staging disk: 75 G total, 33 G used — 45%, comfortable.**

**F.1 — PROCESS LOGS: `/var/log/dawntrader` = 15 G, and it is BOUNDED.** `pm2-logrotate` is configured `max_size 1G` · `retain 14` · `compress true` · daily rotate ⇒ a ~14 G steady-state ceiling, which is exactly what is observed. **Not a growth risk.** ⚠️ **Operational consequence worth knowing: retention is ~14 rotations, and at current volume the LIVE `out.log` spans only ~45 MINUTES.** ⇒ **any log-based investigation of something more than a few hours old must use the rotated `out__*`/`error__*` files, not `out.log`** — a `grep` of the live file returning nothing is an artifact of the window, not evidence of absence.

**F.2 — APP-LOCAL FILE STORES: `/home/deploy/dawntrader/logs/*` ≈ 6 G, and these are NOT bounded by anything.** Daily files, retained from inception, **no pruning, no tier, and NOT covered by any section of this policy before today:**

| store | size | files | span |
|---|---|---|---|
| `phase15b_dbs_telemetry` | **4.9 G** | 105 | 2026-04-15 → |
| `vts_eval_history` | 594 M | 119 | 2026-03-30 → |
| `data_aggregates` | 525 M | 121 | → 2026-07-28 |
| `virtual_trades` | 33 M | 119 | 2026-03-31 → |
| `predictive_adjustments` | 2.3 M | 120 | 2026-03-30 → |
| `fx5_state` | 22 M | 1 | rolling `window_24h.json` (self-bounding) |

★ **NOT an emergency and explicitly not filed as a defect** — ~6 G on a disk at 45% with 40 G free buys a long runway. **It is a POLICY GAP: an entire class of store that grows monotonically and that this document did not previously acknowledge.** The honest disposition is that these need a retention decision *before* the runway matters, not after.
★★ **TWO OF THESE ARE LOAD-BEARING, so do NOT prune them casually:** `virtual_trades` is the population the settings-adjustment routine READS (last 30 files, HYBRID-filtered — see `RUNNING_ISSUES` #174), and `predictive_adjustments` is what it WRITES. **A naive "delete files older than N days" on `virtual_trades` silently changes what that routine computes on.** `phase15b_dbs_telemetry` is the 4.9 G outlier and the obvious first candidate — **Phase 15b is long past, so its consumer set should be established before it is trimmed, not assumed.**

## Delete-only exemptions (each carries its predicate, not just its verdict)

- **`xstock_qd_probe_history`** (P19-B5c plain lane, 90d delete-only, no archive) — **exempt from move-not-delete BECAUSE it is derived telemetry reconstructible from the probes’ sources**; deleting it destroys no primary record (Langston-ruled at the B-TRADE-TIER-REGISTER Step-1, 2026-08-06). Any table that is a PRIMARY record does not qualify for this shelf — the trade tables were moved OFF delete-only by that same batch.
