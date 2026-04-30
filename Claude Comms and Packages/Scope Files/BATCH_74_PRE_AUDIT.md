# Batch 74 — Pre-Implementation Audit

**Status:** v1.1 — Langston Step 2 APPROVED (cc-inbox #869, 2026-04-30). Proceeding to Step 3 implementation per D.1-D.5 commit sequence.
**Scope reference:** `BATCH_74_SCOPE.md` v1.1 (Langston Step 1 approved cc-inbox #867).
**Goal of this document:** Per CLAUDE.md §9, before any code is written, identify every existing component that B74 will touch, walk the SYSTEM_IMPACT_MAP for upstream/downstream/shared-state/blast-radius, and flag anything where my mental model diverges from what's actually in the codebase. The pre-audit is what stops cascade bugs.

---

## A. SIM consultation — every component touched by B74

### A.1 Components B74 ADDS (no existing entries)

| New component | Path | Fits SIM section |
|---|---|---|
| `equity-spot-archiver.ts` | `server/services/passive-archive/equity-spot-archiver.ts` | New — sibling to §3 (Scanning) but data-collection-only |
| `equity-perp-archiver.ts` | `server/services/passive-archive/equity-perp-archiver.ts` | Same |
| `crypto-spot-archiver.ts` | `server/services/passive-archive/crypto-spot-archiver.ts` | Same |
| `ohlc-batch-writer.ts` (shared helper) | `server/services/passive-archive/ohlc-batch-writer.ts` | New — DB-write batch helper |
| `ticker-batch-writer.ts` | `server/services/passive-archive/ticker-batch-writer.ts` | Same |
| `reconnect-policy.ts` | `server/services/passive-archive/reconnect-policy.ts` | Shared utility |
| `universe-loader.ts` | `server/services/passive-archive/universe-loader.ts` | Crypto-pair selection |
| `passive-archive-bootstrap.ts` | `server/startup/passive-archive-bootstrap.ts` | Sibling to §9.5 FX5 Scanner Bootstrap |
| 6 new tables (3 universes × OHLC + ticker) | `equity_spot_ohlc_1m`, `equity_perp_ohlc_1m`, `crypto_spot_ohlc_1m`, `equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `crypto_spot_ticker_snap` | New schema partition |
| 2 new universe config files | `server/config/xstocks-universe.json`, `server/config/equity-perp-universe.json` | New |
| 1 new universe filter config | `server/config/crypto-universe-filter.json` | New |
| 7 new module_constants | `passive_archive` module | Existing pattern |
| 1 new system cron | `b74-refresh-universe.sh` at 03:00 UTC | Existing pattern (replay-ablation cron at 04:00 UTC) |
| 1 new partition-creation cron | runs on 28th of month | New pattern |

### A.2 Components B74 EXTENDS (existing files modified)

| Existing component | SIM § | What B74 changes | Blast-radius assessment |
|---|---|---|---|
| **Symbol Normalization** (`server/services/utils/symbol-canonicalizer.ts`) | §2.3 (HIGH blast radius — incorrect translation breaks all Kraken comms) | Add `PF_<TICKER>X<QUOTE>` → `<TICKER>/USD:PERP` mapping. Existing crypto / X-Z prefix handling unchanged. | **LOW** — purely additive. New regex branch fires only on `PF_*XUSD` pattern. Existing symbols (BTC/USD, XXBTZUSD, etc.) match earlier branches and never reach the new code. Round-trip tests cover both new + old. |
| **`server/index.ts`** (app entry) | — | Add 1 import + 1 call: `await passiveArchiveBootstrap()` after existing bootstraps | **LOW** — startup-only, fire-and-forget pattern. If passive archive fails to initialize, throw is swallowed and main app continues (matches FX5 bootstrap pattern). |
| **`shared/schema.ts`** | — | Add ~150 lines of Drizzle table definitions for 6 new tables | **LOW** — new tables only. No FK edits, no existing-table modifications. |

### A.3 Components B74 DOES NOT TOUCH (verified)

This is the section that prevents cascade bugs. Walking SIM and confirming non-impact:

| SIM § | Component | Why B74 doesn't affect it |
|---|---|---|
| §1 | Central Clock, Multi-Tier Pair System | B74 services run on independent timers (WS event-driven for OHLC; system cron for universe refresh). No central-clock dependency. |
| §2.1 | Kraken WebSocket Adapter (`live-pricing-adapter.ts`) | B74 opens its own dedicated WS connections to `ws-equities`, `futures.kraken.com/ws/v1`, and `ws.kraken.com/v2`. The existing live-pricing-adapter is unchanged and continues to drive Price Cache + frontend feeds independently. |
| §2.2 | Price Cache | Read-only consumers; B74 never writes to or reads from Price Cache. |
| §2.4 | Market Data REST Polling | B74 uses WS-only for OHLC + ticker capture. The 30-second REST tier-A polling in `kraken.ts` is untouched. |
| §2.5 | Cost Cache | B74 doesn't read cost metrics. Equity/perp data has different cost structure entirely; not modeled in B74. |
| §2.6 | OHLC Cache (`ohlc-cache.ts`) | The existing 5-min-TTL in-memory OHLC cache wraps `kraken.ts:getOHLCData()` for 60-min crypto bars consumed by VTS/orchestrator/MCE. **B74 does not use this cache** — it stores raw 1-min bars to a different table directly from WS. The cache continues to serve its existing consumers unchanged. |
| §3.1 | Hexagonal Architecture | B74 is a sibling subsystem (data collection only) — no signal/admission/execution logic. |
| §3.2 | FX5 Scanner | **Critical non-impact:** B74's crypto archiver subscribes to its own WS connection for OHLC. It does NOT call into FX5 Scanner, does NOT read its filter results, does NOT modify any of its inputs. FX5's 30-second metric scan is untouched. |
| §3.3 | Active Filter Pool | Read-only from B74's perspective — never accessed. |
| §3.4 | IMF Metrics | Untouched. |
| §3.5 | Adaptive Ratio Manager | Untouched. |
| §4 | Signal Pipeline (Orchestrator, MCE, SQE, RTB, Pre-Exec Validator, Kelly, Sizing, etc.) | **Critical non-impact:** B74 emits zero signals, calls zero scoring functions, never invokes `getMarketContextEngine()`, `computeContext()`, `runStrategyEngine()`, `signalOrchestrator`, etc. Pure data archive only. |
| §5 | Strategies, Regime Classifier, DBS, Phase Store, Macro Modifier | Same — never touched. B73 + Factor Calibration + B67/B68 substrate work continues unaffected. |
| §6 | Trading Engine, Paper Execution Engine, VTS Runner, Trailing Exit Controller, B73 Hook | Same — never touched. |
| §7 | Data Aggregator, Telemetry Aggregator, MicroExecutionService | Same — never touched. |
| §8 | Frontend (analytics, dashboard, drift dashboard, Factor Calibration panel, etc.) | B74 v1 ships NO UI. Existing analytics page unaffected. |
| §9.1-9.4, §9.6-9.9 | System Health, Circuit Breaker, Scheduler Registry, Stage-3 Emitter | All passive consumers — B74 doesn't affect health metrics, circuit-breaker state, or scheduling. |
| §9.5 | FX5 Scanner Bootstrap | B74's bootstrap runs **after** FX5's. They share no state. |
| §10.1 | WebSocket Broadcast Layer (frontend WS) | Different layer — frontend WS is for UI updates; B74 WS is outbound to Kraken for data ingestion. No overlap. |

### A.4 Database — schema-isolation review

B74 introduces 6 new tables. Walking through the existing DB to confirm no namespace collisions or coupling:

| Concern | Verification |
|---|---|
| Table name collision | None — `equity_spot_ohlc_1m`, `equity_perp_ohlc_1m`, `crypto_spot_ohlc_1m`, `equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `crypto_spot_ticker_snap` — all new, none in existing schema |
| Foreign-key creation INTO existing tables | None — B74 tables have no FK references to `trading_signals`, `paper_sim_trades`, `regime_factor_alternates`, `exit_strategy_alternates`, `vts_trade_records`, etc. |
| Foreign-key creation FROM existing tables | None — no existing table will reference B74 tables (B74 is sink-only, no read consumers in v1) |
| Schema migration risk | New CREATE TABLE statements + partitions only. Cannot break existing tables. Rollback drops only the new tables. |
| Connection pool starvation | Mitigated by per-archiver dedicated slot cap (max 2 concurrent inserts across all 3 archivers). VTS / signal-orchestrator / B73 hooks have their own pool slots and B74 cannot starve them. |
| Lock contention | New tables only — no shared locks with existing live-write tables. |

### A.5 Module-constants risk review

B74 seeds 7 new constants in a new module `passive_archive`:

| Constant | Default | Resolution scope | Risk |
|---|---|---|---|
| `b74_equity_capture_enabled` | `true` | global | Kill-switch. Safe. |
| `b74_perp_capture_enabled` | `true` | global | Kill-switch. Safe. |
| `b74_crypto_capture_enabled` | `true` | global | Kill-switch. Safe. |
| `b74_crypto_min_volume_24h_usd` | `10000` | global | Universe-floor knob. Tuning impacts universe size, not behavior. Safe. |
| `b74_ws_reconnect_max_backoff_sec` | `30` | global | Tuning knob. Safe. |
| `b74_ticker_snapshot_min_interval_ms` | `1000` | global | Throttle knob. Safe. |
| `b74_partition_lookhead_months` | `12` | global | Schema-management knob. Safe. |

All are new keys in a new module → no collision risk with existing `ablation_framework`, `regime_classifier`, `exit_strategy_replay`, `outcome_feedback`, `regime_age`, `path_b_sustainability` modules.

---

## B. Forward-coupling to other batches

This section traces dependencies B74 creates for future batches.

### B.1 Forward-couple: B70 Data Archiving

B74's tables ARE the substrate B70 will manage. B74 commits to:
- Month-range partitioning (`PARTITION BY RANGE(interval_begin)` for OHLC, `PARTITION BY RANGE(captured_at)` for ticker snapshots)
- No FK constraints to live tables (rows must be cold-archivable standalone)
- Self-describing rows: every row carries `symbol`, `universe`, `metadata.schema_version` (Langston-suggested)
- Pre-create 12 forward partitions + cron extend
- Index on `(symbol, time DESC)` to support both live queries AND archival range scans

B70 will define the actual hot/warm/cold cutover thresholds. B74 ships a 0-month-cold default (everything stays in Postgres until B70 ships).

### B.2 Forward-couple: B68.1 Crypto Multi-Timeframe Agreement

B68.1 needs continuous 1-min crypto OHLC. B74's `crypto_spot_ohlc_1m` is exactly that data layer. When B68.1 ships, it adds the signal-pipeline layer that READS from this table and computes multi-TF DBS agreement / 1h regime confirmation. **B74 does not implement signal-pipeline integration** — that's B68.1's deliverable.

Implication: B68.1 timeline is unaffected by B74; B68.1 simply has historical substrate ready when its work begins. B68.1 still owns scope/pre-audit/implementation/test/governance for the signal-side.

### B.3 Forward-couple: Phase 21.5 Equity Trading Expansion

B74's equity tables provide the OHLC/ticker history Phase 21.5 will analyze when designing the equity strategy/regime/admission logic. Phase 21.5 is months out and entirely separate; no commitment from B74 beyond data availability.

**Open question forward-flagged for Phase 21.5:** xStocks short-sell capability — needs explicit Kraken docs verification before live equity trading. Not a B74 concern; B74 captures data only.

### B.4 No backward-coupling to closed batches

B74 introduces nothing that breaks B67, B73, or any other closed batch. The new tables and services are sink-only and independently lifecycle-managed.

---

## C. Risk inventory

### C.1 Risks identified during scoping (carried forward from scope §6)

| Risk | Likelihood | Severity | Mitigation in design |
|---|---|---|---|
| Storage growth outpaces Supabase plan | MEDIUM | MEDIUM | Kill-switches; B70 archival contract honored; monthly DB-size telemetry |
| WS connection instability | MEDIUM | LOW | Exponential backoff + reconnect logging; recovery via REST OHLC fallback if needed |
| Bulk inserts contend with VTS/orchestrator writes | LOW | MEDIUM | Dedicated 2-slot connection pool cap; 5s batch windows amortize overhead |
| xStocks WS rejects subscriptions for full 128 set | LOW | MEDIUM | Discovery probe confirmed at least GOOGL, AAPL accept; fallback shard if 128-symbol single-connection limit hit |
| Crypto WS shard limit | LOW | LOW | Shard at 300 per Langston; current ~400-600 universe = 2 connections × 200-300 |
| Schema partitioning bug (partition not pre-created) | LOW | HIGH | 12-month forward pre-creation + cron + startup self-heal (create-inline + WARN log) |

### C.2 New risks surfaced by SIM consultation

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Symbol-canonicalizer regex extension misclassifies an existing crypto pair as a perp | LOW | HIGH | Strict `PF_*X<QUOTE>` regex anchored at string start; new branch ordered LAST in `toCanonical()` so existing branches catch their cases first; round-trip tests on 6 known crypto pairs + 6 PF perps must pass before push |
| Three concurrent WS connections exhaust Node's open-handle budget | VERY LOW | LOW | Node default ~1024 file descriptors; 3 WS connections + ~100 DB sockets is well under the limit |
| Universe-refresh cron runs while archiver is mid-batch-insert | VERY LOW | LOW | Cron is read-only on Kraken AssetPairs API; only writes to `crypto-universe-filter.json`. Archiver re-reads config on next subscription cycle. No race. |
| Daily universe shrinks unexpectedly (a popular pair drops below volume floor) | MEDIUM | LOW | Logged at universe-refresh time as `[B74][universe] dropped: X, added: Y, kept: N`. Floor is module-constant tunable for emergency relief. |
| Database connection pool exhaustion if all 3 archivers attempt insert simultaneously | LOW | MEDIUM | 2-slot dedicated cap + 5s batch windows. Worst case: archiver waits up to 5s for a slot, batches grow slightly larger. Operations continue. |
| WS reconnect storm during Kraken outage | LOW | LOW | Exponential backoff capped at 30s; logs each retry; never hammers Kraken |
| xStocks WS thread-routing change breaks symbol mapping | LOW | LOW | Symbols accepted in canonical form (GOOGL/USD); no Kraken-side internal-format dependency |

### C.3 Risks deliberately accepted (not mitigated in v1)

- **No retention/archival policy in B74.** Tables grow indefinitely until B70 ships. Acceptable per Kyle directive — B70 owns the tiering.
- **No alerting on archiver outage.** If a WS connection dies and reconnect storm continues, only console logs surface it. UI alarm panels are out of scope for v1. Health-monitor (§9.6) has no integration. Forward-improvement TODO.
- **No data quality checks on inbound bars.** If Kraken sends a bar with wrong `interval_begin` or duplicate timestamp, B74 stores it as-is. Idempotency is best-effort via composite primary key. B70 / future analysis batches can de-dupe at query time.
- **No symbol delisting handling.** If a pair stops trading (delisted), the archiver keeps trying to subscribe. The retry is cheap (tens of ms per attempt) and the universe-refresh cron will drop the pair the next day. Acceptable.

---

## D. Implementation order

Sequenced to minimize surface area at each commit:

### D.1 Commit 1 — Schema + module_constants migration

- `drizzle/migrations/2026-05-XX-b74-passive-archive-tables.sql` + rollback
- `shared/schema.ts` — Drizzle definitions
- 7 module_constants seeds
- 12 monthly partitions pre-created per universe (3 × 12 = 36 partitions total)

**Verification:** `\dt+` shows all 6 partitioned tables; `\d+ equity_spot_ohlc_1m` shows correct partitioning; `SELECT * FROM module_constants WHERE module = 'passive_archive'` returns 7 rows.

### D.2 Commit 2 — Symbol canonicalizer extension + tests

- `server/services/utils/symbol-canonicalizer.ts` — add `PF_*XUSD` regex branch
- `server/tests/unit/b74-symbol-canonicalizer-perp.test.ts` — round-trip tests

**Verification:** `npm test -- b74-symbol-canonicalizer-perp` passes; existing canonicalizer tests still pass.

### D.3 Commit 3 — Universe loader + tests

- `server/services/passive-archive/universe-loader.ts`
- `server/tests/unit/b74-universe-loader.test.ts`
- `server/config/xstocks-universe.json` (128 symbols, harvested from Kraken Pro)
- `server/config/equity-perp-universe.json` (10 symbols)
- `server/config/crypto-universe-filter.json`

**Verification:** universe-loader unit tests pass; manual run of the loader against live Kraken returns expected universe sizes (128 + 10 + ~400-600).

### D.4 Commit 4 — Archivers + bootstrap + cron scripts

- `server/services/passive-archive/{equity-spot,equity-perp,crypto-spot}-archiver.ts`
- `server/services/passive-archive/{ohlc-batch-writer,ticker-batch-writer,reconnect-policy}.ts`
- `server/startup/passive-archive-bootstrap.ts`
- `server/index.ts` — bootstrap call
- `scripts/b74-refresh-universe.sh` (cron-invoked)
- `scripts/b74-create-monthly-partitions.sh` (cron-invoked on 28th)

**Verification:** Local TS check + lint clean. Bring full diff to Langston Step 4 BEFORE push.

### D.5 Commit 5 — Deploy, verify, governance

- Push all 4 commits → CI green
- Deploy to staging
- Verify per scope §1 objectives 1-7
- Update BATCH_CATALOG, PHASE_HISTORY, SIM, CHANGES_AND_FIXES, RUNNING_ISSUES, MEMORY
- Write `BATCH_74_COMPLETION_REPORT.md`

---

## E. Resolved questions (Langston Step 2 — cc-inbox #869)

| # | Question | Resolution |
|---|---|---|
| 1 | Connection-pool slot mechanism | **Wrapper-layer semaphore** (`maxConcurrent=2`) inside `ohlc-batch-writer` + `ticker-batch-writer`. NOT Drizzle pool-config (global, affects other callers). Pattern: acquire → INSERT batch → release; 5s timeout if slot unavailable, retry on next batch window. |
| 2 | WS sharding | **Hash-mod** (`hash(symbol) % shardCount`). All connections in same process (same async loop). No worker-pool / IPC overhead at this scale. |
| 3 | 128 xStocks discovery | **Static config** for v1. Comment in `xstocks-universe.json`: "Last updated: <date>. Source: Kraken Pro markets endpoint. Update via PR when Kraken announces new listings." |
| 4 | Cron script home | **`server/scripts/`** alongside `replay-ablation.ts`. **`.ts` files (not `.sh` wrappers)** so they can import shared TS utilities directly. |
| 5 | Bootstrap order | **LAST** in the bootstrap sequence — AFTER FX5 + signal pipeline. Passive archive is non-critical; failure must not prevent critical services from starting. Fire-and-forget catch+log+continue. |
| 6 | SIM walk completeness | **Confirmed complete.** One forward-flag (not blocking): B74's daily AssetPairs REST call adds to the shared Kraken REST rate-limit pool — negligible at 1 call/day, but worth monitoring if future batches add more REST polling. |

## E.1 Open questions for Step-2 Langston review (legacy header — for archival)

1. **Connection-pool dedicated slot mechanism** — proposed: a wrapper around `db` that acquires-with-timeout from a 2-slot semaphore inside `passive-archive`. Existing code uses `db.execute()` / `db.insert()` directly. Should the dedicated slot be enforced at the wrapper layer (inside `ohlc-batch-writer` / `ticker-batch-writer`) or via Drizzle pool-config tuning? Wrapper is simpler; pool-config affects all callers.

2. **WS sharding logic** — proposed: a small symbol-to-shard hash function (e.g., `hash(symbol) % shardCount`) inside `crypto-spot-archiver` that opens N connections, each subscribing to its slice. Acceptable, or do you prefer a worker-pool pattern (one process per shard)?

3. **128 xStocks harvesting** — proposed: scrape the Kraken Pro markets endpoint once at scope-time, store as static `xstocks-universe.json` config; manual update via PR if Kraken adds/removes symbols. Alternative: dynamic discovery via WS probe at startup (subscribe-or-fail-and-skip pattern). Static is simpler; dynamic is more resilient. Recommend static for v1, document the manual-update process in the bootstrap comment.

4. **Cron script home** — Place new scripts under `scripts/` directory at repo root, OR `server/scripts/` (next to `replay-ablation.ts` which is the existing cron-invoked script)? Either works. `server/scripts/` keeps cron infrastructure co-located.

5. **Bootstrap order** — In `server/index.ts`, where in the existing bootstrap sequence should `passive-archive-bootstrap()` run? Proposed: after `fx5-scanner-bootstrap` and before any signal-pipeline boots. That way passive archive is healthy first; signal pipeline never depends on it. Confirm or override.

6. **Anything I missed in the SIM walk** — A.3 above lists every SIM section and asserts B74 doesn't touch it. Is there a section/component I overlooked or got wrong?

---

## F. Sign-off

- [x] CC: pre-audit drafted
- [x] Langston: Step 2 review (cc-inbox #869, 2026-04-30)
- [ ] CC: address Langston's pre-audit feedback (if any)
- [ ] Proceed to Step 3 (implementation)

*Awaiting Step 2 Langston review before implementation begins.*
