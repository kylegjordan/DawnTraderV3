# BATCH 79.0a — Pre-Implementation Audit (PIA)

**Status:** rev 2 — Langston PIA review APPROVE WITH REVISIONS applied (review at `/tmp/lang_b790a_pia_reply.txt` 2026-05-08 20:55 UTC; verbatim Telegram-relayed msg 3733+3734). Six PIA-time tightenings folded; N3+N4 deferred to B79.0b/B79.x with explicit rationale (original B79 Step-4 review file:line specifics not preserved in repo); SQE wildcard enumeration added per §5.
**Companion to:** `BATCH_79_0a_SCOPE.md` rev 2.
**Cover note:** Langston rev 1 review answered Q1-Q7 (locked in scope §11) + flagged 9 PIA-time tightenings (folded below in §0). This PIA carries the load-bearing line-citation work + SIM upstream/downstream/shared-state/blast-radius traces per Kyle's emphasis ("make sure it is code-level and that you consult the SIM for up and downstream impacts").

---

## §0 — Scope rev 2 + Langston PIA-time revisions cover

Per Langston rev 1 review §1-§9 list (PIA-time, not blocking), the following revisions are folded into this PIA:

| # | Revision | Where applied |
|---|---|---|
| 1 | Obj 8 — add log throughput surface; tighten Supabase pool threshold to 50% | §3 hostile-sim + load-test plan; §6 implementation |
| 2 | Migration 1 assertion — `AND value IS NOT NULL AND value::text != 'null'` | §5 migration SQL |
| 3 | Migration 2 — value-comparison assertion in SQL not "manual check" | §5 migration SQL |
| 4 | Bootstrap HARD-FAIL on `xstockSpotScanner.start()` throw | §1.6 boot path |
| 5 | SIM consultation list adds `equity-spot-archiver.ts` | §2 |
| 6 | `data_freshness_window_ms` from empirical archiver-log measurement | §4 |
| 7 | "± normal traffic" → quantified "± 20% of pre-deploy 1h baseline rate" | §3 hostile-sim verify criteria |
| 8 | Step 9 sequencing — load test BEFORE migration apply (or migration first if freshness gate reads DB on every cycle) | §6 |
| 9 | Pre-deploy projection (Obj 8) vs post-deploy stress observation (Obj 12) clearly distinguished | §3 |

---

## §1 — Code-level line-citations (load-bearing work per Kyle directive)

### §1.1 — `getTelemetryAggregator()` consumer audit (scope Obj 2/3 prerequisite)

```
$ grep -rn "getTelemetryAggregator\(\)" server/ --include="*.ts"
```

Hit list (verified 2026-05-08 against `migration/aws-supabase` HEAD `b205fc283`):

| # | File:Line | Path classification | Required action B79.0a |
|---|---|---|---|
| 1 | `services/adaptive-ratio-manager.ts:93` | INSTANCE METHOD — runs on whichever instance was constructed | **Refactor** — `computeAdaptiveRatio` should consult `this.telemetry` if injected, else fall back to `getTelemetryAggregator()` for back-compat (crypto path) |
| 2 | `services/adaptive-scan-manager.ts:170` | Constructor fallback — already accepts injected | KEEP — already correct pattern |
| 3 | `services/adaptive-scan-manager.ts:390` | Module singleton bootstrap | KEEP (crypto path; xstock uses two-instance factory) |
| 4 | `services/market-indicators.ts:254` | Crypto-context global compute | LEAVE — crypto path; out of B79.0a no-touch fence |
| 5 | `services/telemetry-aggregator.ts:1642` | The factory `export function getTelemetryAggregator()` itself | KEEP |
| 6 | `services/vts-runner.ts:1355` | VTS regime override (`getDominantRegime`) | LEAVE — crypto-only consumer today; VTS multi-asset extension is a separate concern |
| 7 | `services/vts-runner.ts:2121` | Trade-close persist hook | LEAVE — same reasoning |
| 8 | `services/vts-runner.ts:3051` | Open-trades API hook | LEAVE — same reasoning |
| 9 | `routes.ts:635 + 654 + 1903 + 1965 + 2025` (5 hits) | Diagnostic endpoints | LEAVE — admin/diagnostic surface, cross-class read OK |

**Conclusion for B79.0a Obj 3:** the SOLE refactor target is `adaptive-ratio-manager.ts:93`. Constructor accepts optional `telemetry?: TelemetryAggregatorService`; instance methods prefer `this.telemetry` over global. Other call sites are fine as-is.

### §1.2 — `AdaptiveRatioManager` instance-method call-site audit

```
$ grep -rn "adaptiveRatioManager\.\|computeAdaptiveRatio\|new AdaptiveRatioManager" server/ --include="*.ts"
```

| # | File:Line | What | B79.0a impact |
|---|---|---|---|
| 1 | `services/adaptive-scan-manager.ts:193` | `await adaptiveRatioManager.computeAdaptiveRatio(regime, mode)` — global singleton consumer | LEAVE (crypto path) |
| 2 | `services/adaptive-scan-manager.ts:342` | `adaptiveRatioManager.getState()` | LEAVE |
| 3 | `services/adaptive-scan-manager.ts:378` | `adaptiveRatioManager.getCurrentRatio()` | LEAVE |
| 4 | `services/adaptive-ratio-manager.ts:86` | `computeAdaptiveRatio` declaration | **Refactor target** — internal `getTelemetryAggregator()` call replaced with `this.telemetry ?? getTelemetryAggregator()` |
| 5 | `services/adaptive-ratio-manager.ts:297` | `export const adaptiveRatioManager = new AdaptiveRatioManager()` | KEEP — crypto path; uses default constructor (no injected telemetry → falls back to global) |
| 6 | `services/asset-class-instances.ts:102` | `const ratioManager = new AdaptiveRatioManager()` (xstock instance) | **Refactor** — `new AdaptiveRatioManager(undefined, telemetry)` so xstock ARM consumes its own telemetry instance |
| 7 | `tests/integration/adaptive_scanning.test.ts:16, 32, 69, 104, 113` | Test constructions (5 hits) | KEEP — tests construct with config only; back-compat preserved |

**Conclusion for B79.0a Obj 3:** constructor signature changes from `(config?: Partial<RatioConfig>)` to `(config?: Partial<RatioConfig>, telemetry?: TelemetryAggregatorService)`. Single-line constructor body adds `this.telemetry = telemetry`. `computeAdaptiveRatio` line 93 changes from `const telemetry = getTelemetryAggregator()` to `const telemetry = this.telemetry ?? getTelemetryAggregator()`. Tests unchanged (default-arg telemetry = undefined → fallback path).

### §1.3 — Data-freshness extraction site audit (scope Obj 4)

Initial broad grep:

```
$ grep -rn "60_000\|60 \* 1000\|60\\*1000\|priceAge\|MAX_PRICE_AGE\|PRICE_STALE_MS\|isStale\|isFresh.*ms\|tickAge.*1000" server/ --include="*.ts"
```

Hit classification (PIA work — to be exhaustively walked at code-review time):

| Bucket | Count (rough) | Action |
|---|---|---|
| `live-pricing-adapter` cache age (60_000 = 60s default) | ~5-8 sites | Candidate for helper extraction IF gate-keeping signal admission. If purely diagnostic / display, leave. |
| `feed-integrity-monitor.ts` tick-age grade thresholds (2/5/10/20s) | 4 sites | LEAVE — different concept (feed health grade, not signal freshness gate) |
| `asset-capabilities.ts:207, 221` `isStale` | 2 sites | LEAVE — capability metadata staleness, not price freshness |
| `routes.ts:8890` cache `isFresh: <2000` | 1 site | LEAVE — admin diagnostic |
| Auth token refresh (`JWT_REFRESH_SECRET`) | many | LEAVE — unrelated semantic |

**Decision rule for PIA-time exhaustive walk:** any site where price/data age gates "should this signal be admitted to next pipeline stage" is a helper-extraction candidate. Sites where age is purely informational (UI, diagnostics, feed health) are left alone. Step 3 implementation follows this rule with a fresh exhaustive grep + per-site classification commit-comment.

**Closed-market path (Langston Q2 lock):** helper signature `isPairDataFresh(symbol, assetClass, now): boolean`. For `assetClass='xstock_spot' && !isXstockMarketOpenUTC()`, return `true` (treat as fresh — explicit contract, NOT `null`). Crypto path unchanged.

### §1.4 — Bootstrap order audit (scope Obj 1 + §1.6)

`server/index.ts` boot sequence (verified 2026-05-08 post-B79.TEC):

| Order | Line range (approx) | Step | HARD-FAIL? |
|---|---|---|---|
| 1 | ~620-622 | `printRoutes(app)` + `dumpRoutes(app)` | No — purely diagnostic |
| 2 | ~625-637 | `await primeTECConfig()` (B79.TEC) | YES — process.exit(1) on throw |
| 3 | ~640-650 | `await loadTrailingStates()` (B79.TEC moved-here) | YES — process.exit(1) on throw |
| 4 | ~656 | `server.listen(port, ...)` | — |
| 5 | (inside listen callback) | livePricingAdapter, ws-adapter, B79 deferred services | various |

**B79.0a insertion point:** `xstockSpotScanner.start()` MUST happen BEFORE `server.listen` (matching B79.TEC + per-class consistency). Per Langston rev 1 revision #4: HARD-FAIL on throw. Sequence becomes:

```
primeTECConfig → loadTrailingStates → getXstockSpotInstances() (force lazy-init) → xstockSpotScanner.start() → server.listen
```

**Race-window note:** centralClock subscription happens in `start()`. CentralClock `start()` is idempotent — already started by FX5 scanner at its `start()` call. `xstockSpotScanner.start()` only needs to call `centralClock.subscribe(...)`. Tick handler closure can safely capture xstock instances from the lazy factory because `getXstockSpotInstances()` is idempotent + callable from any thread.

**Q for Step 3 implementation:** does FX5 scanner `start()` get called before or after our new B79.0a wire? If FX5's bootstrap happens inside the listen-callback (currently the case), then xstockSpotScanner.start() pre-listen forces centralClock to start earlier. Verify centralClock is safe to start during boot, NOT requiring the listen-callback context. PIA-time grep on `centralClock.start()` confirms 7 sites — none require listen context. SAFE.

### §1.5 — `equity-spot-archiver.ts` shared subscription state (Langston rev 1 revision #5 — SIM consultation expanded; corrected per Langston rev 2 #6 internal-consistency fix)

Live since B69. Owns dedicated WebSocket connection to `wss://ws-equities.kraken.com`. Subscribes to `ohlc(1)` + `ticker` for every symbol in `xstocks-universe.json`. Buffers via `ohlc-batch-writer.ts` + `ticker-batch-writer.ts` (5s flush, 2-slot pool).

**Scanner ↔ archiver relationship (corrected per §1.9 finding):**
- Archiver = INGESS path (writes raw 1m OHLC + ticker snapshots to DB tables `equity_spot_ohlc_1m` + `equity_spot_ticker_snap`).
- Scanner = SIGNAL path. **Per §1.9 grep:** `livePricingAdapter` is crypto-WS-scoped (`kraken_ws`/`binance_ws` only) and does NOT receive xstock prices today. The xstock scanner therefore reads ticker prices DIRECTLY from `equity_spot_ticker_snap` (DB) per cycle — single batched query (Langston rev 2 #1 commitment).
- They do NOT share WebSocket subscription state — archiver owns its own WS; scanner reads DB rows the archiver wrote.

### §1.6 — SIM consultation per Kyle directive (upstream / downstream / shared-state / blast-radius for each affected component)

Read SIM 2026-05-08 (HEAD `b205fc283`). Each entry verified against current SIM + line-cited:

#### `server/services/fx5-scanner.ts` (SIM §3.2 line 178-186)
- **Upstream:** central-clock (trigger), Kraken REST API (market data), price cache, telemetry-aggregator (perf data for adaptive ratio), `screener_filters` table, OHLC cache.
- **Downstream:** active-filter-pool, signal-orchestrator (indirect), cost-cache, stage-3 emitter (WS events), data-aggregator (async logging).
- **Shared state:** `screener_filters` thresholds, `_isScanning` mutex flag, `_clockTickHandler` callback.
- **Background execution:** 30s interval via central-clock.
- **Blast radius:** **CRITICAL** — determines which pairs enter the trading pipeline.
- **B79.0a impact:** TOUCHED ONLY for freshness-helper extraction (single-line per site). Behavioral on crypto path UNCHANGED — verified by Step 7 first-pass criterion (crypto cadence ±10% pre-deploy baseline; B79 forward-watch precedent).

#### `server/services/central-clock.ts` (no dedicated SIM entry; canonical interval source)
- **Upstream:** server boot calls `start()` once.
- **Downstream:** FX5Scanner, MarketEventScheduler, TCL, RTB. New: `XstockSpotScanner` (B79.0a).
- **Shared state:** `_subscribers: Map<string, ClockTickHandler>`; `_tickNumber`, `_lastTickAt`, `_isRunning`.
- **Background execution:** 1s tick interval; broadcasts to all subscribers.
- **Blast radius:** **HIGH** — every clock-driven module depends on it.
- **B79.0a impact:** ZERO modification. New subscriber `XstockSpotScanner` added via `centralClock.subscribe('XstockSpotScanner', handler)`. Subscriber count goes from N to N+1; `getSubscriberCount()` diagnostic reflects.

#### `server/services/adaptive-ratio-manager.ts` (SIM §3.5 line 204-211)
- **Upstream:** telemetry-aggregator (VTS performance data).
- **Downstream:** active-filter-pool (pool composition).
- **Shared state:** `currentRatio`, `lastComparison` per-instance (after constructor refactor: `this.telemetry`).
- **Background execution:** runs during FX5 + future XstockSpotScanner cycles.
- **Blast radius:** **MEDIUM** — affects pair selection bias.
- **B79.0a impact:** Constructor signature extended (back-compat). Crypto path: unchanged behavior (default-arg `telemetry=undefined` → falls back to `getTelemetryAggregator()` global). Xstock path: per-instance ARM consumes per-instance telemetry. Tests at `tests/integration/adaptive_scanning.test.ts` continue to pass (default ARM constructor).

#### `server/services/telemetry-aggregator.ts` (SIM §7.6 line 466-471)
- **Upstream:** VTS runner (trade outcomes — exclusive writer per M70).
- **Downstream:** ARM (pool perf), FX5 scanning (pair ranking), market-indicators.
- **Shared state:** `pairTelemetry` Map (DB-backed only), `cascadeHistory` + `poolAggregates` (file-persisted at `logs/telemetry_state/aggregator_state.json` since B46).
- **Background execution:** 60s file-persist cadence (module-scoped timer at `:1600-1602`).
- **Blast radius:** **MEDIUM** — affects pair selection bias.
- **B79.0a impact:** ZERO modification to global singleton. **Xstock instance constructed via `new TelemetryAggregatorService()` at `asset-class-instances.ts:84` runs IN-MEMORY ONLY** (no disk persist) per documented safety hazard at SIM line 1433. **Risk surfaced:** if xstock VTS observations grow unbounded in the in-memory instance, memory pressure surfaces — Day 1 acceptable per B79 design; B79.x promotes per-instance disk persist with separate path.

#### `server/services/asset-class-instances.ts` (SIM line 1422-1433, NEW B79)
- **Upstream:** none (factory; called by future xstock scanner — NOW WIRED B79.0a).
- **Downstream:** instantiates `TelemetryAggregatorService` + `AdaptiveRatioManager` + `PairFailureTracker` + `AdaptiveScanManager`.
- **Shared state:** `_xstockSpotInstances` module-scoped cached triad.
- **Background execution:** none (pure factory).
- **Blast radius:** **LOW** — crypto path returns null (no-touch). Xstock callers opt-in.
- **B79.0a impact:** `bootstrapXstockSpotInstances` constructor for ARM updated to inject xstock telemetry instance. Comment block at lines 94-101 ("ARM constructor injection of telemetry must be added when live xstock loop wires up in B79.0a") deleted (caveat closed).

#### `server/services/signal-orchestrator.ts` (SIM mentions multiple locations)
- **Upstream:** active-filter-pool, MCE, strategy-engine.
- **Downstream:** RTB, paper-execution-engine, vts-runner, factor-ablation-emitter.
- **Shared state:** none direct (most scoped to call).
- **Background execution:** invoked per FX5 cycle + per VTS cycle (?).
- **Blast radius:** **CRITICAL** — every signal flows through here.
- **B79.0a impact:** TOUCHED ONLY for freshness-helper extraction (if any sites here use price-age gates). PIA-time grep confirms; if zero sites, signal-orchestrator is NOT modified by B79.0a.

#### `server/services/passive-archive/equity-spot-archiver.ts` (SIM line 1242)
- **Upstream:** Kraken WS v2 (`wss://ws-equities.kraken.com`); `xstocks-universe.json`.
- **Downstream:** `ohlc-batch-writer` + `ticker-batch-writer` (DB persistence). Reverse-direction: B79.0a Q-D probe + load test rerun READ archiver-emitted DB rows.
- **Shared state:** WS connection (its own); reconnect backoff.
- **Background execution:** persistent — long-lived WS subscription.
- **Blast radius:** **LOW** to scanner path (decoupled — scanner reads cache/DB, archiver writes DB).
- **B79.0a impact:** ZERO modification. **Used by PIA §4 empirical inter-tick measurement** (Langston rev 1 revision #6) — mine archiver logs OR `equity_spot_ticker_snap` table for p50/p95/p99 inter-tick gap per symbol.

### §1.7 — N3 redundant truthy strategy guard (DEFERRED to B79.0b/B79.x)

**Finding (PIA rev 2):** the original B79 Step-4 PUSH_GREENLIT review file (with the specific N1-N4 file:line citations) is not preserved in the repo's `Claude Comms and Packages/Langston Design Asks/` directory. The 4 non-blocking notes are documented as summary text in `MULTI_ASSET_VTS_EXPANSION_PLAN.md` row "2026-05-07 evening" but without specific code locations.

**Decision (Langston rev 2 acceptable):** N3 deferred to B79.0b cleanup mini-batch (separate from B79.0a's load-bearing live-wire-in scope). B79.0b will perform a fresh `grep -rn 'if (strategy &&' server/ --include="*.ts"` to surface candidate redundant-truthy patterns, classify each, and remove the truly redundant ones. Sequenced AFTER B79.0a deploy + 48h verify (alongside the N2 SQE wildcard removal).

### §1.8 — N4 missing boundary tests (DEFERRED to B79.0b/B79.x)

**Finding (PIA rev 2):** same as §1.7 — original review's specific boundary-case enumeration is not preserved. Candidate areas for boundary-test addition (educated guesses based on B79 ship surface):
- `safeResolveAssetClass` for unknown patterns (partially covered in `asset-classes.test.ts`)
- `XSTOCK_SPOT_SYMBOLS` Set lookup (cold-cache; large symbol set)
- `isXstockMarketOpenUTC` edge cases (DST transitions, holiday calendar — though holiday calendar is explicitly B79.x)
- `bootstrapXstockSpotInstances` idempotency under concurrent first-call

**Decision:** N4 deferred to B79.0b/B79.x. Boundary tests added when their underlying components are next touched OR as a focused B79.x test-coverage batch. Out of B79.0a scope.

**N2 + N3 + N4 cleanup mini-deploy = B79.0b** (sequencing locks):
1. B79.TEC.b (wildcard `break_even_enabled` row removal — already scoped, separate from B79.0a)
2. **B79.0b** (post-B79.0a +48h: SQE wildcard rows from §5 enumeration + N3 redundant truthy + N4 boundary tests)

### §1.9 — `livePricingAdapter` xstock pricing path (RESOLVED via grep 2026-05-08)

```
$ grep -rn "ws-equities\|kraken-equities\|equity_spot|xstock" server/services/live-pricing-adapter.ts
(no matches)

$ grep -rn "updateFromWebSocket" server/services/live-pricing-adapter.ts
700:  updateFromWebSocket(symbol: string, price: number, source: 'kraken_ws' | 'binance_ws' = 'kraken_ws', traceId?: string): void {
716:    priceCache.updateFromWebSocket(normalized, price);
1012:    livePricingAdapter.updateFromWebSocket(evt.symbol, evt.price, evt.source, evt.traceId);
```

**Finding:** `livePricingAdapter` accepts only `'kraken_ws' | 'binance_ws'` sources. xstock prices are NOT pushed to it today. The `equity-spot-archiver` writes directly to `equity_spot_ohlc_1m` + `equity_spot_ticker_snap` DB tables (cadence: 5s flush via batch writers).

**B79.0a decision (CC lean — confirm with Langston):**

- **Scanner reads xstock_spot prices from `equity_spot_ticker_snap` table** (most-recent-tick query per cycle).
- 5s archiver-flush cadence + 30s central-clock interval = plenty of margin; staleness gate (`isPairDataFresh`) catches any out-of-band lag.
- **Pro:** zero new infrastructure; matches existing archiver-writes / scanner-reads decoupling pattern; livePricingAdapter remains crypto-scoped (consistent with no-touch fence).
- **Con:** ~50ms DB roundtrip per pair per cycle (vs ~1ms cache hit on crypto path) — load-test (scope Obj 8 with combined 1.3× crypto + xstock dry-run) measures actual impact; gate decides.
- **Alternative (if Langston counters):** extend livePricingAdapter with an `'equities_ws'` source type + hook into archiver's WS to push ticker events into both DB AND cache. More invasive (touches livePricingAdapter — ~no-touch-fence-adjacent); could be B79.x cleanup.

**Action:** Step 3 implementation reads from DB. Langston rev 2 CONFIRMED + ADDED tightening: per-cycle xstock pricing read MUST be a single BATCHED query, not N round-trips. Required SQL pattern:

```sql
SELECT DISTINCT ON (symbol) symbol, price, captured_at
FROM equity_spot_ticker_snap
WHERE symbol = ANY($1)
ORDER BY symbol, captured_at DESC;
```

**Load-test surface** (Langston rev 2 #1 + scope Obj 8): per-cycle DB-roundtrip ms reported as its own surface in load-test output (NOT just rolled into Supabase pool %). If trends >100ms/cycle OR roundtrip exceeds central-clock budget headroom, that's a B79.x adapter-extension batch BEFORE more asset classes onboard — NEVER a backpressure shed (per #81 policy).

**Alternative deferred:** extend `livePricingAdapter` with an `'equities_ws'` source type + hook into archiver's WS. More invasive (touches livePricingAdapter — no-touch-fence-adjacent); could be B79.x cleanup IF load-test shows DB-roundtrip is a problem.

---

## §2 — SIM consultation summary table (for Langston review)

| File | Layer | B79.0a touch | Blast radius | Required SIM update at Step 10 |
|---|---|---|---|---|
| `services/asset_classes/xstock_spot/scanner.ts` | 3 (Scanner) | NEW | HIGH (live signal generation for new asset class) | YES — new entry mirroring fx5-scanner |
| `services/adaptive-ratio-manager.ts` | 4 (Adaptive) | constructor refactor | MEDIUM | YES — note constructor signature change |
| `services/asset-class-instances.ts` | 9 (Bootstrap) | bootstrap update | LOW | YES — caveat block at line 94-101 closed; ARM injection wired |
| `services/fx5-scanner.ts` | 3 (Scanner) | freshness-helper extraction (no behavioral change) | CRITICAL (no-touch fence) | YES (minor) — note refactor |
| `services/signal-orchestrator.ts` | 4 (Routing) | freshness-helper extraction (if any sites) | CRITICAL (no-touch fence) | YES (minor) IF touched |
| `services/central-clock.ts` | 9 (Infra) | new subscriber | HIGH | YES — note new XstockSpotScanner subscriber |
| `services/telemetry-aggregator.ts` | 7 (Telemetry) | ZERO | MEDIUM | NO (no source change) |
| `services/passive-archive/equity-spot-archiver.ts` | 6 (Archive) | ZERO | LOW | NO (no source change; mined for empirical data only) |
| `index.ts` | 9 (Boot) | new bootstrap step | HIGH | YES — note new boot step + HARD-FAIL handler |
| `routes.ts` | 8 (API) | new diagnostic endpoint | LOW | YES — note new endpoint |
| `utils/data-freshness.ts` | 9 (Utility) | NEW | LOW | YES — new entry |
| `asset_classes/xstock_spot/pattern-pool-filters.ts` | 4 (Filter) | N2 cleanup | LOW | YES (minor) IF touched |

---

## §3 — Hostile-sim plan (scope §6 + Langston rev 1 revision #7 quantified)

### Procedure

**Q5 conditions (Langston rev 2 #5 — was missing in PIA rev 1):**
- Hostile-sim env flag `BACKPRESSURE_TEST_MODE` MUST be gated behind `NODE_ENV !== 'production'` so the flag cannot silently linger in prod config.
- When the flag is set + the gate passes, scanner emits `[B79.0a][HOSTILE_SIM_ACTIVE]` startup log line (grep-friendly cosmetic insurance).

1. Pre-deploy: capture pre-flight baseline of:
   - Crypto factor cadence (1h rolling) — same SQL pattern as B79.TEC.
   - PM2 CPU% / RSS / Hetzner load avg (5min average).
   - Supabase active connection count + p95 query time.
   - PM2 log throughput (lines/min over last 1h).
2. Deploy B79.0a normally; verify Step 7 first-pass green.
3. **Hostile sim:** set `BACKPRESSURE_TEST_MODE=1` env flag in `.env` on staging; PM2 restart.
4. **Verify both legs (Langston rev 1 Q5 lock):**
   - (a) Cycles continue emitting — `[B79.0a][SCAN_CYCLE_DONE]` log lines appear at expected cadence (no skipped tick).
   - (b) `[B79.0a][BACKPRESSURE_OBSERVED]` telemetry signal fires.
5. **Restore:** unset env flag; PM2 restart.
6. Verify normal cadence resumes; both signals stop firing.

### Acceptance criteria (quantified per Langston rev 1 revision #7)

- Crypto factor cadence: ±20% of pre-deploy 1h baseline rate.
- PM2 CPU%: ≤ 70% (≥30% headroom).
- Hetzner load avg: ≤ 70% of CPU count.
- Supabase pool: ≤ 50% utilization (Langston rev 1 revision #1 — tightened from 30% to 50%).
- Memory: ≤ 70% of 4GB.
- Log throughput: ≤ 50% of disk-write capacity.

### Pre-deploy projection vs post-deploy stress observation (revision #9)

- **Pre-deploy projection (scope Obj 8):** `b79-0a-load-test.ts` runs (a) 1.3× crypto replay + (b) xstock dry-run scan loop. Measures combined load. Sizing-gate decision = "ship as-is" / "ship after Hetzner upgrade" / "halt".
- **Post-deploy stress observation (scope Obj 12):** `+24h forward-watch` reruns the load test + measures actual production cadence. Verifies projection didn't underestimate.

---

## §4 — Empirical inter-tick measurement plan (Langston rev 1 revision #6 + Q2 lock)

To choose `data_freshness_window_ms` for xstock_spot Day 1:

```sql
-- Langston rev 2 #4: dropped time filter; archive activity itself defines market-open
-- (cleaner than EDT-specific 13:30-20:00 which fails on DST transitions).
WITH inter_tick AS (
  SELECT
    symbol,
    captured_at,
    LAG(captured_at) OVER (PARTITION BY symbol ORDER BY captured_at) AS prev_at
  FROM equity_spot_ticker_snap
  WHERE captured_at > NOW() - INTERVAL '6 hours'
  ORDER BY symbol, captured_at
)
SELECT
  symbol,
  COUNT(*) AS samples,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (captured_at - prev_at))) AS p50_sec,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (captured_at - prev_at))) AS p95_sec,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (captured_at - prev_at))) AS p99_sec
FROM inter_tick
WHERE prev_at IS NOT NULL
GROUP BY symbol
ORDER BY samples DESC
LIMIT 20;
```

Run during Step 3 implementation. Choose:
```
data_freshness_window_ms = max(p99_max_sec * 1000 + 5000, central_clock_interval_ms)
```

Rough Day 1 estimate (if archiver shows healthy 1-2s cadence on liquid names + 10-20s on quiet ones): `value = 60_000` (60s) likely, but VALIDATE BEFORE pinning. Embedded in Migration 1.

---

## §5 — Migrations (Langston rev 1 revisions #2 + #3)

### Migration 1 — `data_freshness_window_ms` for xstock_spot

```sql
BEGIN;
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('market_data', '*', 'xstock_spot', '*', '*', 'data_freshness_window_ms', '<EMPIRICAL-PIA-VALUE>'::jsonb, 'B79.0a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name='market_data'
     AND asset_class='xstock_spot'
     AND constant_name='data_freshness_window_ms'
     AND value IS NOT NULL                 -- Langston rev 1 #2
     AND value::text != 'null';            -- Langston rev 1 #2
  IF row_count != 1 THEN
    RAISE EXCEPTION 'B79.0a Migration 1 assertion failed: expected 1 valid (non-null) row, found %', row_count;
  END IF;
END $$;
COMMIT;
```

### Migration 2 — N2 SQE wildcard cleanup (PIA rev 2 enumeration complete)

**Live psql query against staging Supabase 2026-05-08 confirms current state:**

| module_name | asset_class | constant_name | value | Action B79.0a |
|---|---|---|---|---|
| sqe_config | * | min_final_score | 0.35 | **Add explicit crypto_spot=0.35 + xstock_spot=0.35** (Day 1 starting placeholder) |
| sqe_config | * | min_regime_weight | 0.30 | **Add explicit crypto_spot=0.30 + xstock_spot=0.30** (Day 1 starting placeholder) |
| sqe_config | xstock_spot | adx_min | 18 | EXPLICIT row already exists (B79 ship); leave |
| sqe_config | xstock_spot | di_min_pattern | 10 | EXPLICIT row already exists; leave |
| sqe_config | xstock_spot | di_min_quant | 18 | EXPLICIT row already exists; leave |
| sqe_config | xstock_spot | momentum_min | 0.002 | EXPLICIT row already exists; leave |
| pattern_pool_gates | crypto_spot | * (4 keys) | (already explicit) | Leave |
| pattern_pool_gates | xstock_spot | * (2 keys) | (already explicit; B79 ship) | Leave |

**Wildcard rows requiring per-class promotion in Migration 2:** ONLY the two `sqe_config` keys above (`min_final_score`, `min_regime_weight`). All other SQE/pattern-pool keys already have explicit per-class rows from B79.

**Migration 2 SQL (PIA rev 2):**

```sql
BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- min_final_score per-class promotion (wildcard 0.35 preserved)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0a'),
  ('sqe_config', '*', 'xstock_spot', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0a'),
  -- min_regime_weight per-class promotion (wildcard 0.30 preserved)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0a'),
  ('sqe_config', '*', 'xstock_spot', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Langston rev 1 #3: explicit value-comparison assertion in SQL.
-- Verifies each new explicit row exists AND has value matching the current wildcard.
-- Fails loud if pre-existing operator override doesn't match (manual review required).
DO $$
DECLARE
  wildcard_min_final_score jsonb;
  wildcard_min_regime_weight jsonb;
  expected_count int := 4;
  actual_count int;
BEGIN
  SELECT value INTO wildcard_min_final_score FROM module_constants
   WHERE module_name='sqe_config' AND asset_class='*' AND constant_name='min_final_score';
  SELECT value INTO wildcard_min_regime_weight FROM module_constants
   WHERE module_name='sqe_config' AND asset_class='*' AND constant_name='min_regime_weight';

  -- Count of explicit per-class rows now matching the wildcard values.
  SELECT COUNT(*) INTO actual_count FROM module_constants
   WHERE module_name='sqe_config'
     AND asset_class IN ('crypto_spot', 'xstock_spot')
     AND constant_name IN ('min_final_score', 'min_regime_weight')
     AND ((constant_name='min_final_score' AND value=wildcard_min_final_score)
       OR (constant_name='min_regime_weight' AND value=wildcard_min_regime_weight));

  IF actual_count != expected_count THEN
    RAISE EXCEPTION 'B79.0a Migration 2 assertion failed: expected % matching rows, found %. Pre-existing override may exist; manual review required.', expected_count, actual_count;
  END IF;
END $$;

COMMIT;
```

**B79.0b mini-deploy** (after 48h verify gate, mirroring B79.TEC.b pattern): DELETE the two `sqe_config` wildcard rows once explicit per-class rows are confirmed in production resolution path.

---

## §6 — Implementation sequencing (Step 3 plan, with Langston revisions folded)

1. Confirm `livePricingAdapter` xstock-spot wiring (PIA §1.9 OPEN). If not wired, decide: extend adapter OR scanner reads DB. **Block on this answer.**
2. Refactor `AdaptiveRatioManager` constructor → optional `telemetry?` second arg + `this.telemetry` instance field.
3. Refactor `bootstrapXstockSpotInstances` to inject xstock telemetry into ARM construction.
4. Empirical inter-tick measurement (PIA §4 SQL on Supabase staging) → derive `data_freshness_window_ms` value.
5. Write Migration 1 (with empirical value).
6. Apply Migration 1 to staging Supabase (Langston rev 1 #8 — migrations BEFORE load test since freshness gate reads DB on every cycle).
7. Extract `isPairDataFresh(symbol, assetClass, now)` helper at `server/utils/data-freshness.ts` (or co-located).
8. Replace freshness sites in fx5-scanner / signal-orchestrator (per §1.3 classification — exhaustive grep + per-site decision).
9. Build `XstockSpotScannerService` at `server/asset_classes/xstock_spot/scanner.ts` (Q6 lock). Skeleton: `start()` subscribes to centralClock; `stop()` unsubscribes; tick handler invokes scan flow using `getXstockSpotInstances()`.
10. Wire `xstockSpotScanner.start()` in `server/index.ts` boot AFTER primeTECConfig + loadTrailingStates + BEFORE server.listen with HARD-FAIL handler (rev 1 #4).
11. Add `/api/diagnostics/xstock-scanner` endpoint at routes.ts.
12. N3 redundant guard removed.
13. N4 boundary tests added.
14. Q-D probe script (`scripts/b79-0a-qd-probe.ts`) — symbol set per Langston Q1 (mega-caps + 1 high-vol + 1 lower-tier-liq).
15. Load test script (`scripts/b79-0a-load-test.ts`) — combined 1.3× crypto + xstock dry-run (Q3 lock); Supabase pool 50% headroom (rev 1 #1); log throughput surface (rev 1 #1).
16. Migration 2 (per PIA-time SQE enumeration).
17. Run load test against staging → sizing-gate decision.
18. Deploy if gate passes.
19. Hostile sim per §3.
20. Forward-watch +24h.

---

## §7 — Acceptance for Step 1+2 close

- [x] Scope rev 2 (Langston APPROVE WITH REVISIONS applied)
- [ ] Langston APPROVE on this PIA rev 1
- [ ] PIA §1.9 livePricingAdapter wiring question answered (Step 3 prerequisite)
- [ ] PIA §4 empirical inter-tick measurement run; value captured for Migration 1
- [ ] PIA §1.7-§1.8 N3+N4 surfaced (file:line)

After Langston-greenlit, Step 3 implementation begins.

---

*End BATCH_79_0a_PRE_AUDIT.md rev 1.*
