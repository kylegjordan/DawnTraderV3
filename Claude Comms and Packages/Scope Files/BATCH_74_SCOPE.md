# Batch 74 — Passive OHLC Archive Pipeline (Equity + Crypto)

**Status:** Draft v1.1 — Langston Step 1 APPROVED (cc-inbox #867, 2026-04-30). Proceeding to Step 2 pre-audit.
**Type:** Passive data-collection infrastructure. No signal-pipeline impact, no admission gates, no consumers.
**Triggered by:** Kyle directive 2026-04-29 / extended 2026-04-30 — start accumulating finer-grained OHLC + ticker substrate NOW so by the time downstream batches need it (Phase 21.5 equity expansion, B68.1 crypto multi-timeframe), there are weeks-to-months of historical context to backtest against. Two design decisions that emerged in scoping:
1. Capture 1-min OHLC as finest resolution and derive higher tiers (5m / 15m / 30m / 60m / 240m / 1440m) on-demand via aggregation queries — exact, lossless, single-source.
2. Capture continuous ticker snapshots (bid / ask / last / volume / vwap / spread / extended-hours flag / prev-day refs) for sub-minute granularity that OHLC bars don't expose.

**Parent context:** Phase 15c. B73.2 + Factor Calibration UI panel just shipped (commit `a98ce7ff`, PM2 #119). B67.4 cheap-tier bundle is queued NEXT after B67.3.5 verification gates clear. B74 ships in parallel — no functional overlap with B67/B73/active trading.

**Workflow:** All 11 steps. Langston Step 1 review before implementation begins.

---

## 0. Decisions locked through scoping conversation

| Question | Decision | Source |
|---|---|---|
| Equity universe | All 128 xStocks visible in Kraken Pro markets | Kyle 2026-04-30 ("I want all 128 feeding in, not just a curated list") |
| Equity perp universe | All 10 PF_*XUSD perps on Kraken Futures | Verified via Kraken Futures REST |
| Crypto universe | USD/USDT/USDC quote with non-zero 7d volume (~400-600 pairs) | Kyle 2026-04-30 (Option B from CC's 3-option breakdown — full 1,545 universe was too heavy) |
| Forex | DEFERRED — Kraken doesn't trade forex; would need new vendor | Verified via WS probe |
| Capture strategy | 1-min OHLC + ticker snapshots, both continuous via WebSocket | Kyle 2026-04-30 ("include the continuous ticker snapshot capture and the one-minute OHLC") |
| Higher timeframes (5m, 15m, 1h, etc.) | Derive on-demand from 1-min via aggregation, no separate subscription | Kyle 2026-04-30 (confirmed lossless upsampling logic) |
| Crypto 1-min capture | INCLUDED in B74 (sibling deliverable to equity); defers to B68.1 for signal-layer integration | Kyle 2026-04-30 ("if it's doable to add in B68.1, then let's do it now so we're collecting that data") |
| Retention | NOT enforced in B74. B70 archive batch handles hot/warm/cold tiering | Kyle 2026-04-30 ("we'll have to make sure we look at when we get to batch 70") |
| Schema preconditions for B70 | Month-range partitioning, no FKs to live tables, self-describing rows, JSONB metadata for forward-compat | CC proposal, Kyle approved |
| xStocks short-sell capability | OPEN QUESTION for Phase 21.5 — needs explicit Kraken docs verification before live trading | CC noted; Kyle agreed to defer |
| FX5 / admission impact | ZERO. Separate WS connections, separate rate-limit pools, no consumer wiring | Architectural invariant |

---

## 1. Numbered objectives

### Objective 1 — All 128 xStocks captured continuously

**Deliverable:** Persistent WebSocket subscription on `wss://ws-equities.kraken.com` covering all 128 xStocks, persisting 1-min OHLC + per-update ticker snapshots into `equity_spot_ohlc_1m` + `equity_spot_ticker_snap` tables.

**Verification:**
- After 1 hour of uptime, `SELECT count(DISTINCT symbol) FROM equity_spot_ohlc_1m WHERE interval_begin >= now() - interval '1 hour'` returns ~128 (allowing for symbols that didn't trade during the window).
- After 1 hour, `SELECT count(*) FROM equity_spot_ticker_snap WHERE captured_at >= now() - interval '1 hour'` returns thousands of rows.
- Auto-reconnect verified by simulating WS disconnect (kill connection, observe reconnect within 60s, no data loss beyond the disconnect window).
- Universe list is config-driven via `server/config/xstocks-universe.json` — adding a new symbol requires only a config edit + restart.

### Objective 2 — All 10 stock perp futures captured continuously

**Deliverable:** Persistent WebSocket subscription on `wss://futures.kraken.com/ws/v1` covering all 10 PF_*XUSD perps, persisting 1-min OHLC + ticker snapshots into `equity_perp_ohlc_1m` + `equity_perp_ticker_snap`.

**Verification:**
- After 1 hour, both tables show rows for all 10 PF_*XUSD symbols.
- Auto-reconnect verified.
- Symbol canonicalizer correctly maps `PF_AAPLXUSD` → canonical perp form (proposed `AAPL/USD:PERP` or `AAPL_PERP/USD` — to be locked in implementation).

### Objective 3 — Crypto USD/USDT/USDC universe captured continuously

**Deliverable:** Persistent WebSocket subscription on `wss://ws.kraken.com/v2` covering the dynamic crypto universe (~400-600 pairs), persisting 1-min OHLC + ticker snapshots into `crypto_spot_ohlc_1m` + `crypto_spot_ticker_snap`.

**Universe selection** (computed at startup, refreshed daily via cron):
- Quote ∈ {USD, USDT, USDC}
- 24h trading volume ≥ $10,000 USD-equivalent (filters dead pairs and stablecoin/stablecoin)
- Pair status = "online" per Kraken AssetPairs API

**Verification:**
- Universe size at startup logs to console as `[B74][crypto] universe=<N> pairs (USD: <a>, USDT: <b>, USDC: <c>)`.
- After 1 hour, `equity_spot_ohlc_1m` has rows for at least 80% of universe (allowing for low-volume pairs that may not have produced bars in any given hour).
- WS sharding logic (if needed for >500 symbols per connection) is transparent to query layer.

### Objective 4 — Symbol canonicalizer extension for perp form

**Deliverable:** Extend `server/services/utils/symbol-canonicalizer.ts` `toCanonical()` to handle the `PF_<TICKER>X<QUOTE>` Kraken Futures naming convention. Round-trip tests pass.

**Verification:**
- Unit tests: `toCanonical("PF_AAPLXUSD") === "AAPL/USD:PERP"` (or whatever final canonical form is decided), `toCanonical("PF_TSLAXUSD") === "TSLA/USD:PERP"`.
- Existing canonicalizer tests still pass (no regression).

### Objective 5 — Schema designed for B70 archival

**Deliverable:** All six new tables (3 universes × 2 table types) implement the B70 archival contract:
- Primary partition column: `interval_begin TIMESTAMPTZ NOT NULL` (OHLC) or `captured_at TIMESTAMPTZ NOT NULL` (ticker snapshots)
- Monthly range partitioning via `PARTITION BY RANGE (...)`
- 12 monthly partitions pre-created at deploy (current month + 11 forward); cron pre-creates the next month's partition before month-end
- No FK constraints to other live tables (rows must be cold-archivable standalone)
- Self-describing: every row includes `symbol`, `universe`, and a `metadata JSONB` column for forward-compat
- Index on `(symbol, interval_begin DESC)` (OHLC) or `(symbol, captured_at DESC)` (ticker snapshots) — supports both live queries and archival range scans

**Verification:**
- `\d+ equity_spot_ohlc_1m` shows the partitioning + indexes correctly.
- A `DROP TABLE equity_spot_ohlc_1m_2025_06` (hypothetical old partition) succeeds without affecting current-month data.

### Objective 6 — No impact on existing live signal pipeline

**Deliverable:** B74 services run as independent processes within the existing `dawntrader` PM2 entry. They:
- Subscribe via separate WebSocket connections (no shared state with FX5 / signal-orchestrator / VTS)
- Persist via dedicated DB connection pool slot (cap to 2 concurrent inserts so they don't starve other writers)
- NEVER call into FX5 scanner, MCE, signal-orchestrator, or VTS code paths
- NEVER touch `module_constants` ablation toggles or any consumer-facing state

**Verification:**
- Code review confirms no imports of B74 services from any non-B74 file.
- Post-deploy: VTS open-trade rate, FX5 scan cycle latency, and signal-orchestrator emit count are statistically unchanged from pre-deploy baseline (24h before/after comparison).

### Objective 7 — Operationally safe

**Deliverable:**
- Module constants for kill-switches: `b74_equity_capture_enabled`, `b74_perp_capture_enabled`, `b74_crypto_capture_enabled` (default true; can be flipped via SQL UPDATE for emergency disable without code change).
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s capped) on WS disconnect.
- Insert errors logged but never propagated; capture loop continues on per-row errors.
- Rate-limit handling: if Kraken pushes back, throttle/backoff, never crash.
- WS connection health: log every 60s with `[B74][<universe>] connected: <bool>, last_msg_age_ms: <N>, rows_persisted_60s: <N>`.

**Verification:**
- Kill-switch test: `UPDATE module_constants SET constant_value = false WHERE constant_name = 'b74_crypto_capture_enabled'` causes the crypto capture to stop persisting within 60s, no errors thrown.
- Disconnect test: forcibly close the WS connection (or simulate via firewall block); reconnect within 60s, capture resumes.

---

## 2. Schema design

### 2.1 OHLC tables (3 instances: `equity_spot_ohlc_1m`, `equity_perp_ohlc_1m`, `crypto_spot_ohlc_1m`)

```sql
CREATE TABLE equity_spot_ohlc_1m (
  id              BIGSERIAL,
  symbol          TEXT        NOT NULL,
  universe        TEXT        NOT NULL,        -- 'equity_spot' | 'equity_perp' | 'crypto_spot'
  interval_begin  TIMESTAMPTZ NOT NULL,        -- bar start, partition key
  open            NUMERIC(20, 8) NOT NULL,
  high            NUMERIC(20, 8) NOT NULL,
  low             NUMERIC(20, 8) NOT NULL,
  close           NUMERIC(20, 8) NOT NULL,
  volume          NUMERIC(28, 8) NOT NULL,
  vwap            NUMERIC(20, 8),
  trade_count     INTEGER,
  metadata        JSONB,                       -- forward-compat (extended-hours flag, fundingRate for perps, etc.)
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (interval_begin, symbol, id)     -- partition key MUST be in PK
) PARTITION BY RANGE (interval_begin);

CREATE INDEX equity_spot_ohlc_1m_sym_time
  ON equity_spot_ohlc_1m (symbol, interval_begin DESC);

-- Pre-create 12 monthly partitions (deploy month + 11 forward). Cron creates next month's
-- partition on the 28th of the current month.
CREATE TABLE equity_spot_ohlc_1m_2026_05 PARTITION OF equity_spot_ohlc_1m
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- ... 11 more forward
```

### 2.2 Ticker snapshot tables (3 instances: `equity_spot_ticker_snap`, `equity_perp_ticker_snap`, `crypto_spot_ticker_snap`)

```sql
CREATE TABLE equity_spot_ticker_snap (
  id              BIGSERIAL,
  symbol          TEXT        NOT NULL,
  universe        TEXT        NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL,
  bid             NUMERIC(20, 8),
  bid_qty         NUMERIC(28, 8),
  ask             NUMERIC(20, 8),
  ask_qty         NUMERIC(28, 8),
  last            NUMERIC(20, 8),
  volume_24h      NUMERIC(28, 8),
  vwap_24h        NUMERIC(20, 8),
  high_24h        NUMERIC(20, 8),
  low_24h         NUMERIC(20, 8),
  open_24h        NUMERIC(20, 8),
  prev_day_close  NUMERIC(20, 8),              -- equity-specific, null for crypto
  prev_day_volume NUMERIC(28, 8),              -- equity-specific, null for crypto
  is_extended_hours BOOLEAN,                   -- equity-specific, null for crypto
  open_interest   NUMERIC(28, 8),              -- perp-specific, null otherwise
  funding_rate    NUMERIC(12, 8),              -- perp-specific, null otherwise
  metadata        JSONB,
  PRIMARY KEY (captured_at, symbol, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX equity_spot_ticker_snap_sym_time
  ON equity_spot_ticker_snap (symbol, captured_at DESC);

-- 12 monthly partitions pre-created.
```

### 2.3 Universe config

`server/config/xstocks-universe.json` — array of 128 spot equity symbols, edited by hand.
`server/config/equity-perp-universe.json` — array of 10 PF_*XUSD perp symbols.
`server/config/crypto-universe-filter.json` — `{minVolume24hUsd: 10000, allowedQuotes: ["USD","USDT","USDC"]}` — selector criteria, applied at startup AND refreshed daily via cron.

---

## 3. Service architecture

```
server/services/passive-archive/
  equity-spot-archiver.ts      ← persistent WS to ws-equities.kraken.com
  equity-perp-archiver.ts      ← persistent WS to wss://futures.kraken.com/ws/v1
  crypto-spot-archiver.ts      ← persistent WS to wss://ws.kraken.com/v2 (sharded if >500 symbols)
  ohlc-batch-writer.ts         ← shared bulk-insert helper (groups bars by 5s window, single INSERT per batch)
  ticker-batch-writer.ts       ← same for ticker snapshots
  reconnect-policy.ts          ← shared exponential backoff helper
  universe-loader.ts           ← startup + daily-refresh universe selection logic for crypto

server/startup/
  passive-archive-bootstrap.ts ← spawns the 3 archiver services on app start; respects kill-switch constants
```

**Concurrency model:** each archiver is a single async loop with its own WS connection. No shared mutable state across archivers. Bulk inserts are batched (5-second windows) to amortize round-trips. Insert errors logged + continue.

**Resource isolation:** dedicated DB connection pool slot (max 2 concurrent inserts across all 3 archivers) so passive archive can't starve writes from VTS / signal-orchestrator / B73 ablation hooks.

---

## 4. Migration plan

| File | Type | Lines |
|---|---|---|
| `drizzle/migrations/2026-05-XX-b74-passive-archive-tables.sql` | NEW | ~400 (6 tables + 12 partitions each = 72 partitions + indexes + constants) |
| `drizzle/migrations/2026-05-XX-b74-passive-archive-rollback.sql` | NEW | ~80 (DROP TABLE statements) |
| `shared/schema.ts` | MOD | +~150 (Drizzle table defs for the 6 new tables) |
| `server/services/passive-archive/*.ts` | NEW | ~600 (six files per architecture above) |
| `server/services/utils/symbol-canonicalizer.ts` | MOD | +~40 (PF_*XUSD handling + tests) |
| `server/startup/passive-archive-bootstrap.ts` | NEW | ~80 |
| `server/index.ts` | MOD | +5 (import + call to bootstrap) |
| `server/tests/unit/b74-symbol-canonicalizer-perp.test.ts` | NEW | ~60 |
| `server/tests/unit/b74-universe-loader.test.ts` | NEW | ~80 (deterministic universe selection logic) |
| `server/config/xstocks-universe.json` | NEW | ~150 (128 symbols) |
| `server/config/equity-perp-universe.json` | NEW | ~15 (10 symbols) |
| `server/config/crypto-universe-filter.json` | NEW | ~10 |

**Estimate:** ~1,650 lines new, ~200 lines modified. 1 migration commit, 1 implementation commit, 1 governance commit.

**Module constants seeded:**
| Module | Constant | Default | Purpose |
|---|---|---|---|
| `passive_archive` | `b74_equity_capture_enabled` | `true` | Kill-switch for equity spot |
| `passive_archive` | `b74_perp_capture_enabled` | `true` | Kill-switch for equity perps |
| `passive_archive` | `b74_crypto_capture_enabled` | `true` | Kill-switch for crypto |
| `passive_archive` | `b74_crypto_min_volume_24h_usd` | `10000` | Universe inclusion floor |
| `passive_archive` | `b74_ws_reconnect_max_backoff_sec` | `30` | Capped exponential backoff |
| `passive_archive` | `b74_ticker_snapshot_min_interval_ms` | `1000` | De-duplicate ticker snapshots — only persist if ≥ 1s since last per symbol |
| `passive_archive` | `b74_partition_lookhead_months` | `12` | How many forward partitions to pre-create |

---

## 5. B70 archival contract (forward link)

This batch's tables are designed for B70 to extend with a hot/warm/cold tiered archival policy. The contract:

- **Hot (Supabase, queryable):** most recent N months. Default proposal: 3 months. B70 may tune.
- **Warm (Supabase, partition-locked, read-mostly):** N+1 to M months. Optional aggregation to higher timeframes if storage pressure appears.
- **Cold (S3-compatible object store, gzipped JSONL):** older than M months. Each row is self-describing (`symbol` + `universe` + all fields) so S3 dump is trivial.

B70 may:
- DROP entire monthly partitions older than M months after exporting them to S3.
- ALTER TABLE to add aggregated `_5m`, `_1h`, `_1d` derivative tables and depopulate `_1m` for older partitions.
- Add a query-helper view that transparently UNIONs hot Postgres data + cold S3-replayed data when historical analysis needs it.

B74 commits to NOT create any constraint that B70 would need to break. Specifically: no FKs from active live tables (trading_signals, paper_sim_trades, regime_factor_alternates, exit_strategy_alternates, etc.) into B74 tables.

---

## 6. Risk analysis

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Storage growth outpaces Supabase plan | MEDIUM | MEDIUM | Kill-switches + B70 archival queued. Monthly DB-size telemetry continues. |
| WS connection instability | MEDIUM | LOW | Exponential backoff + reconnect logging. Capture interruptions are recoverable from Kraken's REST OHLC history if absolutely needed. |
| Bulk inserts contend with VTS / orchestrator writes | LOW | MEDIUM | Dedicated connection pool slot capped at 2 concurrent. Insert batching (5s windows) amortizes overhead. |
| Crypto universe selector misses or includes wrong pairs | LOW | LOW | Config-driven floor + daily refresh. Manual override via config file edit. |
| xStocks WS rejects subscriptions for full 128 set | LOW | MEDIUM | Discovery probe confirmed at least GOOGL, AAPL, BTC accept; full 128 needs verification at deploy. Fallback: shard across 2 WS connections if single-connection limit hit. |
| Schema partitioning bug (partition not pre-created) | LOW | HIGH | Cron pre-creates next month's partition on the 28th; alarm if the next-month partition is missing 24h before month-end. |
| Kraken Futures WS rate-limits or rejects 10 perps | VERY LOW | LOW | 10 symbols is trivial volume. |

---

## 7. Resolved questions (Langston Step 1 — cc-inbox #867)

| # | Question | Resolution |
|---|---|---|
| 1 | Canonical perp form | **`AAPL/USD:PERP`** — colon-suffix convention is standard across crypto data providers (TradingView, CCXT, CoinGecko). Reads as "Apple denominated in USD, perpetual contract." `AAPL_PERP/USD` would mislead consumers into treating `AAPL_PERP` as a base currency. |
| 2 | Ticker snapshot frequency cap | **1 snapshot/symbol/second is correct.** Every-WS-update would be 5-50x higher on active pairs (Kraken sends multiple updates/sec on majors). 1s floor gives sub-minute granularity for spread analysis without DB blow-up. Tunable via module_constants for targeted research. |
| 3 | Crypto WS sharding threshold | **Shard at >300, not >500.** Kraken WS v2 docs recommend ≤250 subscriptions per connection. 300 gives a conservative buffer above the recommendation. For 600-pair universe = 2 connections × 300. Shard logic transparent to query layer (all rows → same table). |
| 4 | Forward partition runway | **12 months pre-created + cron-extended on 28th of each month is correct.** PLUS: startup-time sanity check — if current month's partition is missing (cron miss), create it inline with a loud `[B74][partition][WARN]` log rather than crashing. Belt-and-braces. |
| 5 | Universe-refresh cron | **System crontab, NOT internal setInterval.** Consistent with existing cron pattern (replay-ablation runs at 04:00 UTC). Standalone script invoked via `npm run b74:refresh-universe` is more observable, more killable, and survives PM2 restarts better. Schedule at **03:00 UTC** (before 04:00 ablation replay so universe changes are reflected in next-day capture). |
| 6 | xStocks short-sell capability | **Strictly defer to Phase 21.5.** B74 is data capture only. Short-sell verification requires explicit Kraken API testing with real orders — not a B74 concern. |

## 7.1 Sanity-check items from Step 1 review

- **Crypto $10k 24h volume floor: FINE.** Conservative sensible default. Could go as low as $5k while still filtering garbage. Tunable via module_constants without redeploy.
- **Schema partitioning for B70: SOUND.** PLUS: include `schema_version: 1` field in metadata JSONB on every row so B70's cold-storage reader can handle schema evolution across months.
- **3-WS architecture + resource isolation: CLEAN.** No additional changes required.
- **Storage trajectory: NOTED.** Kill-switches provide instant relief if pressure appears before B70 ships. **Forward TODO for Kyle:** review Supabase plan limits and pricing tiers before B74 has been running for 3 months.

---

## 8. Sign-off

- [ ] Kyle: scope approved
- [x] Langston: Step 1 review (cc-inbox #867, 2026-04-30)
- [ ] Langston: Step 2 pre-audit review (after CC writes pre-audit per workflow)
- [ ] Langston: Step 4 code-level review (before push)
- [ ] CI: all 4 checks green
- [ ] Step 7: post-deploy verification (per Objective verification criteria)
- [ ] Langston: Step 8 second-pass verification
- [ ] Step 10: governance updates (BATCH_CATALOG, PHASE_HISTORY, SIM, CHANGES_AND_FIXES, RUNNING_ISSUES, MEMORY)
- [ ] Step 11: completion report

*Awaiting Step 1 Langston review before proceeding to pre-audit.*
