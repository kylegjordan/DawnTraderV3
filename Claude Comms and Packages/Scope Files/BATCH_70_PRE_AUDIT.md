# BATCH 70 — Pre-Implementation Audit (Step 2)

**Date:** 2026-05-04
**Scope ref:** `BATCH_70_SCOPE.md` (Step 1 APPROVED, cc-inbox #893)
**Author:** Claude Code
**Reviewer:** Langston

---

## 1. Components Touched (per `BATCH_70_SCOPE.md` §A.6 wiring)

| # | Component | SIM ref | Hook role |
|---|---|---|---|
| 1 | MCE (`market-context-engine.ts`) | SIM §5.2.5 | `pair_scan_archive` write hook — post `computeContext()` |
| 2 | Signal Orchestrator (`signal-orchestrator.ts`) | SIM §4.1 | `signal_eval_archive` write hook — at existing emit-ablation site (~L638) |
| 3 | VTS Runner (`vts-runner.ts`) | SIM §7.1 | `signal_eval_archive` + `exit_decision_archive` — at existing emit-ablation (~L1374) + exit-loop |
| 4 | Paper Execution Engine (`paper-execution-engine.ts`) | SIM §6.1 | `exit_decision_archive` — at `closePosition()` |
| 5 | External Macro Feed (`external-macro-feed.ts`) | SIM §1182 (chain) | `macro_feed_archive` — post `fetchCoinGeckoGlobal` |
| 6 | B74 Passive-Archive Pattern (`passive-archive/*`) | SIM §1124 | Mirror pattern — `archive-batch-writer.ts` modeled on `ohlc-batch-writer.ts` |
| 7 | Drift Dashboard Aggregator (`drift-dashboard-aggregator.ts`) | SIM §10.3 + §1163 | `DataArchiveSection` panel + `/api/analytics/data-archive-status` |

---

## 2. Per-Component Impact Analysis

### 2.1 MCE — `market-context-engine.ts`

- **Upstream:** OHLC data (caller-provided), `calculatePairRegime()`, `CANONICAL_REGIME_STRATEGY_MAP`. **B70 reads from MCE state — no upstream change.**
- **Downstream consumers (existing):** Signal Orchestrator, VTS Runner, market-indicators.ts. **B70 adds one more downstream consumer (`pair-scan-archiver`) — purely read-side fan-out.**
- **Shared state:** Per-symbol context cache (60s TTL), singleton. **B70 reads cache snapshots, does not mutate.**
- **Background execution:** 60s interval per symbol. **B70 hook fires synchronously after `computeContext()`. Critical: archiver MUST NOT block the cycle — write through `archive-batch-writer` queue with bounded depth + drop-on-overflow.**
- **Blast radius:** **HIGH** (per SIM). If archiver hook throws or hangs, regime classification stops. **Mitigation:** wrap hook in try/catch + `setImmediate` to defer the queue push off the hot path. Logged-and-dropped on any error.
- **Hook site:** `computeContext()` returns a `MarketContext` object — call `pairScanArchiver.enqueue(symbol, context, dbsScore, modulators)` immediately after, before return. The 7-modulator chain values are already computed by `refreshAllConfigs()` per cycle (SIM §1194), so they're in scope.

### 2.2 Signal Orchestrator — `signal-orchestrator.ts`

- **Upstream:** Active Filter Pool, MCE, Cost Model, ranking-weights, OHLC Cache, Price Cache, PATTERN_POOL_STRATEGIES. **B70 does not touch upstream.**
- **Downstream:** SQE, RTB, VTS Runner mirror, Telemetry. **B70 adds `signal-eval-archiver` enqueue at the existing emit-ablation hook (~L638 per SIM §977). This is parallel to the B67.0 ablation row write — same trigger condition, different table.**
- **Shared state:** SYSTEM_GUARDS config, DI calc, deterministic confidence. **No state change.**
- **Background execution:** Event-driven on Active Filter Pool entry. **B70 hook fires once per evaluation, same cadence.**
- **Blast radius:** **CRITICAL** (per SIM). Any error in the archiver hook MUST be caught + logged + dropped. Same try/catch + queue pattern as 2.1.
- **Hook site:** Add `signalEvalArchiver.enqueue({pair, strategy, gate_decision, features, modulators, reject_stage, asset_class, exchange, mode: 'paper_sim'})` next to the existing `emitAblationRecord` call. Reject branches (SQE-failed / RTB-stale / TCL-cooldown / strategy-internal-null) already exist in the orchestrator — wire each to its own `reject_stage` enum value.

### 2.3 VTS Runner — `vts-runner.ts`

- **Upstream:** Price Cache (VTS bucket), MCE, Pattern Recognition, OHLC Cache, BTC OHLC, Active Filter Pool, PATTERN_POOL_STRATEGIES, hybrid-compatibility-registry. **No upstream change.**
- **Downstream:** VTS Service, Telemetry Aggregator (M70 — only VTS writes telemetry), ML Calibration. **B70 adds `signal-eval-archiver` (parallel to existing emit-ablation at L1374) + `exit-decision-archiver` (at the exit-loop close path).**
- **Shared state:** open-trade state map, per-strategy counters. **No mutation.**
- **Background execution:** 60s interval. **Same as MCE — must not block cycle.**
- **Blast radius:** **HIGH** (per SIM). Same try/catch + queue pattern.
- **Hook sites:**
  - **Signal-eval:** existing emit-ablation at `vts-runner.ts:~1374` — add `signalEvalArchiver.enqueue(...)` adjacent. `mode: 'vts'`.
  - **Exit-decision:** the close-trade branch (~ where `persistRealPriceTrade` is called, ~L1700-1800). Capture exit reason, exit ATR, R-multiple, time-in-trade, regime/DBS at exit vs entry. `mode: 'vts'`.

### 2.4 Paper Execution Engine — `paper-execution-engine.ts`

- **Upstream:** TCL, Price Cache, Guardrails V2, Pre-Execution Validator, Net Expectancy Kernel, signal metadata. **No upstream change.**
- **Downstream:** Portfolio state (DB), trade history (`paper_sim_trades`), Telemetry, WebSocket broadcasts, TRADE_CLOSED events. **B70 adds `exit-decision-archiver` enqueue at `closePosition()`.**
- **Shared state:** Portfolio position tracking. **No mutation.**
- **Background execution:** 1.5s monitoring loop + signal-driven entry. **Hook fires at close events, low cadence (50–300/day).**
- **Blast radius:** **CRITICAL** (per SIM). Try/catch + queue.
- **Hook site:** `closePosition()` — capture exit reason (BE_stop / SL_hit / TP_target_hit / TRAIL_hit / time_stop / regime_flip), exit ATR, distance-from-entry, R-multiple, time-in-trade, regime/DBS at entry (already on the position record), regime/DBS at exit (read MCE current). `mode: 'paper_sim'`.

### 2.5 External Macro Feed — `external-macro-feed.ts`

- **Upstream:** CoinGecko `/global` endpoint (with B69.3 Demo API key + 429 backoff), Binance `/premiumIndex`. **No upstream change.**
- **Downstream:** B67.1 macro modifier consumer in MCE. **B70 adds `macro-feed-archiver` enqueue inside `fetchCoinGeckoGlobal` and `fetchFundingRate` post-success paths.**
- **Shared state:** In-process rolling 720-sample window. **B70 persists each per-cycle snapshot — does not mutate the window.**
- **Background execution:** 60s interval. **Hook is post-fetch on success only.**
- **Blast radius:** **MEDIUM** — feed itself is robust to skipped writes (fallback active when feed unavailable). Try/catch + queue.
- **Hook site:** at the end of `fetchCoinGeckoGlobal` (after parse, before return) and `fetchFundingRate` (parallel). One row per successful fetch with full snapshot (btc_dom, mcap_mom, funding, fallbackActive flag).

### 2.6 B74 Passive-Archive Pattern (mirror, not modify)

- **Reference implementation:** `server/services/passive-archive/ohlc-batch-writer.ts` + `ticker-batch-writer.ts` (SIM §1124). 5s flush, 1000-row chunked insert (post-B74.1 Postgres 65,535-param bind-limit fix), 2-slot semaphore on writes.
- **Forward-couple:** SIM §1147 explicitly notes B70 will define hot/warm/cold tiering and mentions the schema_version=1 forward-contract. **B70 honors this — every JSONB blob carries `schema_version: 1`.**
- **Risk:** copying the pattern, not modifying B74 itself. Zero cross-contamination.

### 2.7 Drift Dashboard Aggregator — `drift-dashboard-aggregator.ts`

- **Upstream:** Various aggregators (passive-archive, calibration, etc.). **B70 adds `computeDataArchiveStatus()` exporter mirroring `computePassiveArchiveStatus()` (SIM §1163).**
- **Downstream:** `/api/analytics/data-archive-status` route + `DataArchiveSection` UI panel.
- **Blast radius:** **LOW** — UI surface only.
- **Hook site:** new function in aggregator, new route in `routes.ts`, new component import in `analytics.tsx`.

---

## 3. Cross-Component Cascade Analysis

| Risk | Surface | Mitigation |
|---|---|---|
| Archiver throws → blocks 60s cycle | MCE / VTS Runner hot path | try/catch wraps every `enqueue` call; on error, log `[B70][ARCH]` + drop, never rethrow |
| Queue overflow under load | All archivers share `archive-batch-writer` queue | Bounded queue (default 50k); on overflow, drop oldest + emit `[B70][ARCH][OVERFLOW]` log; surface count in dashboard panel |
| DB pressure from 5 concurrent batch writers | Postgres connection pool, WAL volume | Mirror B74 — single batch-writer with 2-slot semaphore + 1000-row chunks. Schedule retention sweep at 02:00 UTC, off-peak from cron windows |
| Schema migration races partition cron | New tables need partitions before writes start | Bootstrap last in startup (mirror B74); partition self-heal at boot |
| JSONB GIN index bloat | `features` / `modulators` / `gate_decision` indices | Don't index full JSONB by default; create partial indices only on the specific keys analysis queries hit (e.g., `(gate_decision->>'reject_stage')`); evaluate after first week of data |
| asset_class derivation cost on hot path | Every archiver row computes `resolveAssetClass(symbol, exchange)` | B69 resolver is exchange-first lookup → O(1) for the common cases. Confirmed safe in B69 audit. |

---

## 4. Volume Estimate (D.2 measurement)

Hard live-sample auth was rate-limited mid-audit. Falling back to derivation from known constants:

| Source | Cadence | Active surface | Rows/day estimate |
|---|---|---|---|
| `pair_scan_archive` | 60s | ~177 active pairs (post-filter pool) | 177 × 1440 = **~255k/day** (lower than initial 547k estimate — 547k assumed all 380 archived pairs are scanned, but only filter-pool members hit MCE) |
| `signal_eval_archive` (full capture incl pre-filter) | 60s | 380 pairs × ~17 strategies × pre-filter-yield ratio | If ~50% of evals hit a strategy: 380 × 17 × 0.5 × 1440/60 = **~155k/day**. If higher pre-filter retention: bounded by 380 × 17 × 1440/60 = **~1.5M/day upper bound** |
| `exit_decision_archive` | per-trade-close | ~50–300 closes/day (current VTS rate) | **~50–300/day** |
| `macro_feed_archive` | 60s | global | **~1,440/day** |
| `b62_retroactive_labels` | one-shot | Mar 6 – Apr 16 VTS trades | **~3–5k rows total** (one-time backfill) |

**90-day steady state:**
- pair_scan_archive: **~23M rows** (well under 80M ceiling)
- signal_eval_archive: **~14M – 135M rows** (depends on pre-filter retention)
- exit_decision_archive: ~5–27k
- macro_feed_archive: ~130k

**D.2 verdict:** signal_eval_archive at the 50% pre-filter assumption is **~14M rows / 90d** — comfortable. Full-spray worst case (1.5M/day) hits 135M / 90d, **above the 80M ceiling Langston flagged**. Recommendation: **ship with full capture at v1, but add a `module_constants` toggle `b70_signal_eval_pre_filter_capture` (default `true`)** so we can flip to post-SQE-only if the 7-day in-prod measurement shows we're tracking toward worst-case. Cheap insurance, no refactor.

**Action item for Step 3:** instrument a 1-hour live row-count sample on pair_scan + signal_eval before declaring the batch GREEN. Add a one-off counter log line per archiver per minute during initial rollout.

---

## 5. Module-Constants Audit

New `data_archive` module (per scope §A.8). Existing module-constants resolver is asset-class-aware (B69) → no resolver changes. Defaults:

| Key | Default | Notes |
|---|---|---|
| `b70_pair_scan_capture_enabled` | `true` | Master toggle |
| `b70_signal_eval_capture_enabled` | `true` | |
| `b70_signal_eval_pre_filter_capture` | `true` | **NEW per §4 verdict — kill-switch for D.2 worst case** |
| `b70_exit_decision_capture_enabled` | `true` | |
| `b70_macro_feed_capture_enabled` | `true` | |
| `b70_parquet_export_enabled` | `false` | Off until 7-day Postgres-side capture verified |
| `b70_partition_lookhead_months` | `2` | Mirror B74 |
| `b70_postgres_retention_days` | `90` | |
| `b70_retention_sweep_batch_size` | `10000` | D.1 batched-DELETE governance |
| `b70_retention_sweep_pause_ms` | `100` | `pg_sleep(0.1)` between batches |

---

## 6. Migration & Rollback Plan

- **Forward:** `drizzle/migrations/2026-05-XX-b70-data-archive-tables.sql`
  - 5 partitioned tables (mirror B74 partitioning)
  - GIN partial indices only on the JSONB keys analysis queries hit
  - 11 module_constants seed rows
  - 1 cron line for retention sweep (02:00 UTC daily)
  - 1 cron line for Parquet export (03:00 UTC daily, gated by toggle)
- **Rollback:** `2026-05-XX-b70-data-archive-tables.rollback.sql`
  - DROP all 5 tables + their partitions
  - DELETE module_constants rows for `data_archive` module
  - crontab `-l | grep -v 'b70-' | crontab -` (remove cron lines)
- **B62 re-label one-shot:** separate SQL or Node script run AFTER table creation, NOT in main migration. Idempotent: `ON CONFLICT (trade_id) DO NOTHING`.

---

## 7. Test Plan

| Layer | Test |
|---|---|
| Unit | Each archiver — given a synthetic event, asserts a row with the expected JSONB shape lands in queue (in-memory mock writer) |
| Unit | `archive-batch-writer` — bounded queue, drop-on-overflow, chunked flush |
| Unit | B62 re-label runner — synthetic vts_eval_history snapshot → expected retroactive label |
| Integration | Full pipeline — synthetic MCE cycle + signal eval + trade close → verify rows in all 4 tables, joinable by `(timestamp, pair, asset_class)` |
| Integration | Parquet export — generates a valid Parquet file readable by `pyarrow` (offline check, not in CI) |
| CI | All 4 GitHub Actions checks must be GREEN before deploy. Per Kyle directive 2026-05-04, deploy after Test Suite + Build + Docker pass without waiting on legacy TS Check |

---

## 8. Verification Plan (Step 7 outcomes-based)

Per scope §C — 8 checks. Adding D.2-derived items:

9. ✅ 1-hour live row-count sample shows `pair_scan_archive` < 11k rows/hr (255k/day target rate); `signal_eval_archive` projects under 1M rows/day at full-spray.
10. ✅ Bounded-queue overflow log line appears 0 times in 1-hour sample under steady-state load.

---

## 9. Step 3 Implementation Order (recommendation)

1. **Migration + tables + module_constants seed** (deployable without consumers — schema change first, hooks later, surgical low-risk first commit)
2. **`archive-batch-writer.ts`** (mirror B74)
3. **`macro-feed-archiver.ts`** (lowest cadence, simplest hook — proves wiring on the easiest path)
4. **`pair-scan-archiver.ts`** (medium cadence, MCE hook — proves the hot-path try/catch pattern)
5. **`exit-decision-archiver.ts`** (low cadence, VTS+paper-engine hooks)
6. **`signal-eval-archiver.ts`** (highest cadence, riskiest — last + most monitoring)
7. **`b62-relabel-runner.ts`** (one-shot, can run any time after tables exist)
8. **Drift Dashboard `DataArchiveSection` panel** + API route
9. **Parquet exporter** (off-by-default, ship behind toggle)

Each numbered step is independently deployable + verifiable. If signal-eval volume spikes catastrophically, we still have the lower-cadence archivers running and producing useful data.

---

## 9b. Mode-agnostic capture (Kyle directive 2026-05-04, mid-Step-2)

**Design property added to scope §M:** archivers must accept data from whichever execution path is running and switch seamlessly as paths switch. Implications for the pre-audit trace:

| Component | Hook required? | Mode value |
|---|---|---|
| MCE (pair_scan_archive) | Yes — single hook, fires for all modes | derived from `getCurrentMode()` |
| Signal Orchestrator (signal_eval_archive, live path) | Yes — currently dormant per SIM §4.1; hook lands now, fires when live activates | `'live'` |
| VTS Runner (signal_eval_archive + exit_decision_archive, passive path) | Yes — currently active | `'vts'` |
| Paper Execution Engine (exit_decision_archive, paper-sim path) | Yes — currently dormant for active trading; hook lands now, fires when paper-sim activates Phase 19 | `'paper_sim'` |
| External Macro Feed (macro_feed_archive) | Yes — single hook, mode-independent (global feed) | n/a (global) |

**Mode resolution source-of-truth investigation needed in Step 3:** locate the existing run-mode controller. Candidates: `server/services/trading-mode.ts` (if exists), `client/src/contexts/TradingModeContext.tsx` (SIM §10.4 — client-side), or boot-orchestrator (SIM §9.1). Pre-audit deferral: Step 3 first commit will identify the canonical server-side accessor and export `getCurrentMode(): 'vts' | 'paper_sim' | 'live'`. If no canonical accessor exists, B70 creates `server/services/run-mode-controller.ts` as a thin wrapper around whatever signal currently determines mode (e.g., presence of active VTS interval vs paper-execution-engine running vs live-trading flag).

**Cross-mode invariant:** at any moment exactly one mode is dominant. Archivers don't enforce this — they trust the controller. If the controller returns the wrong mode, rows get the wrong tag; no data corruption, just mis-tagging that can be re-derived from timestamp + which hook emitted.

**Updated implementation-order callout (§9):** Step 3.0 (before migration) is now "identify or create the `getCurrentMode()` accessor" — single shared dependency for every archiver hook.

---

## 10. Open questions remaining for Langston

**P.1** Should the 1-hour live volume measurement be a hard gate before merging step 6 (signal-eval-archiver), or can it be measured post-deploy with the kill-switch as the safety net? **My read:** post-deploy with the kill-switch is fine — risk is bounded by the toggle.

**P.2** Should `pair_scan_archive` capture **every pair in the universe** (380 archived) or **only filter-pool members** (~177 active)? Scope §C check #2 implied the larger number; my §4 estimate revised down. **My read:** capture only filter-pool members in v1 — that's what MCE actually computes context for. Pre-filter rejects (the 380 - 177 ≈ 203 pairs that didn't make filter-pool) are captured in `signal_eval_archive` with `reject_stage='pre_filter'`. Avoids double-counting, halves pair_scan volume.

**P.3** B62 re-label runner — should it write to `b62_retroactive_labels` AND back-populate a column on the existing closed-trade JSON logs, or only the new table? **My read:** new table only. Don't mutate historical artifacts; queries can JOIN by trade_id.

---

*End of `BATCH_70_PRE_AUDIT.md`. Awaiting Langston review.*
