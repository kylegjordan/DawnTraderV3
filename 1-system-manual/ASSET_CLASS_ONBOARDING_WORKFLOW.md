# Asset Class Onboarding Workflow

**Tier 2 governance document.** Mandatory pre-read before any new asset class enters DawnTrader. Created in B79 (Phase 24) with `xstock_spot` as the canonical worked example.

**Living doc.** Every asset class onboarded adds a new Section H entry + iterates the template based on what was learned. By the time a fifth asset class lands, the doc is battle-tested.

**Phase 24 status (2026-05-10):** xstock_spot fully onboarded across 9 sub-batches. The doc was updated with **only the genuinely new standing rules** — Section L (ticker-collision check, the most important Phase 24 addition) + a tightened H.1.x. Trial-and-error history of how we got there lives in the per-batch completion reports, NOT here.

---

## Procedural checklist — execution order for onboarding a new asset class

**This is the executable blueprint.** Follow it sequentially. Each numbered step references the detailed reference Section (A through L below) for HOW. The 11-step canonical batch workflow from CLAUDE.md §2 wraps this — every numbered onboarding step is itself a Step 1-11 batch.

| # | Step | Reference | Output / artifact |
|---|---|---|---|
| 0 | **Trigger** — Kyle directive to onboard new asset class | — | Memo or directive recorded in `MEMORY.md` + `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §12 update log |
| 1 | **Ticker-collision check** — live exchange API intersection BEFORE architecture decisions | Section L | `<NEW_CLASS>_<EXISTING>_COLLISIONS` constant + provenance comment + regression-lock tests |
| 2 | **Operational profile** — fill the Section A.0 table for the new asset class | Section A.0 | Filled table (trading hours, settlement, custody, exchange endpoints, symbol forms, universe, tick/lot). Decide: is this asset class monolithic OR per-symbol-heterogeneous (Phase 24 H.1.x rule 3)? |
| 3 | **Discovery + inventory** — pair universe, ticker source, live-pricing path, per-pair characteristics, asset-specific (sector, fundamentals, IV) | Section A | A-checklist filled |
| 4 | **Architecture decisions** — scanner shared vs dedicated; family-filter path; RTB pool; live-pricing adapter; telemetry isolation; pattern pool; quant family paths | Section B + Phase 24 H.1.x rule 4 | B-decisions table populated. If signal distributions differ from existing classes, build separate-instance triad via `getAssetClassInstances` factory. |
| 5 | **Schema + module_constants** — verify or add `asset_class` column on every relevant table; insert seed rows for the new class; tag `tunable_status` correctly | Section C + Phase 24 H.1.x rule 2 | Drizzle migration SQL + module_constants seed SQL. Every behavioral knob has explicit per-class row (HARD-FAIL gate enforced at boot). |
| 6 | **Code surface** — populate `server/asset_classes/<class>/{regime-thresholds,friction,pattern-pool-filters,market-hours,index}.ts`; extend `resolveAssetClass`; wire dispatch in `calculatePairRegime`, `cost-model`, `signal_quality_evaluator`, `MULTI_FAMILY_ELIGIBILITY`, telemetry boundaries, TEC stop-eval | Section D | All files added/modified. Section D.1 below has concrete extension templates from xstock_spot. |
| 7 | **18-stage walkthrough** — for each pipeline stage answer: which variables/thresholds/gates apply, are they class-scoped or shared, where do values come from, Layer-1 baseline value, tagged `pending_layer_3` if no domain-knowledge answer | Section E | Row-per-stage table populated for the new class (mirrors Section H.1.E pattern) |
| 7b | **Calibration cycle** — 3 mandatory sub-cycles: regime classifier (Sub-cycle 1), filter thresholds (Sub-cycle 2), strategy gate testing (Sub-cycle 3). Each has an observation window + tuning step + exit criteria. **Initial Layer-1 seed values are domain-knowledge starters, not production-tuned — empirical calibration is required.** Tracked in the asset class's diagnostics tracker. | Section "Step 6b — Calibration cycle" below | Pass/fail per sub-cycle + threshold-change migration log |
| 8 | **Layer 1 / Layer 2 / Layer 3 protocol** — domain-knowledge baseline → cross-asset shadow-classify sanity → live shadow-mode VTS observation. Both ablation frameworks (B67.0 calibration + B73 exit-strategy) wired in parallel, each with asset-class-scoped emission | Section F + Section F.0 | Layer 1 values seeded; Section F.X observation period sized per evidence accumulation rate |
| 9 | **Verification + forward-watch** — behavioral verify checklist; no-touch fence SQL on existing classes; 24h + 7d forward-watch metrics; strategy-gap monitoring (5 triggers) | Section G | Verify checklist + post-deploy SQL artifacts |
| 10 | **Dedicated observation UI tab** — new asset class gets its own tab; both ablation panels side-by-side per Kyle directive | Section I.0 #6 | UI tab live with filter diagnostics + 2 ablation panels |
| 11 | **Worked example** — populate Section H.N with the new class's worked example; populate Section H.N.x post-mortem at T+7d post-go-live with **only genuinely new standing rules** (per Phase 24 lesson) | Section H | Section H.N entry. Trial-and-error history lives in per-batch completion reports, NOT here. |

**Decision Framework rules (Section I + Section I.0 universal rules)** apply throughout — re-check on every architectural choice.

---

## Onboarding Step Sequence Refinements — Phase 24 retrospective (Kyle directive 2026-05-11, captured before forgetting)

Phase 24 (xstock_spot) is the canonical worked example, BUT the path it took had unnecessary detours that the next asset class (B80 crypto_perp, etc.) must avoid. This section captures the corrected sequence + the audit discipline that should have run on day 1.

### Corrected order of operations

Execute in this exact order. Skipping any one of these causes the same surfacing-failure pattern B79.0a → B79.0d → B79.0m.a produced (scaffolding without functionality, told user it worked when it didn't).

#### Step 1 — Threshold/range/gate authorship (DB rows BEFORE wiring)

For every behavioral knob, BEFORE any wiring code, decide and seed the DB row:
- **Regime classifier ranges** (`module_constants.regime_classifier` + `regime_phase` + `volume_regime` + `regime_age` + `path_b_sustainability` + `multi_tf_agreement` + `pair_correlation` + `outcome_feedback`) — author asset-class-explicit rows for any threshold expressed in absolute volatility/momentum/return-magnitude units. KEEP wildcard for math primitives (`directional_integrity`, `dbs_calculation`) — these are scale-free. Document inline justification for each wildcard-keep.
- **Strategy selection criteria** (`module_constants.strategy_gates.<assetClass>.<strategy>.enabled` rows) — explicit row for EVERY strategy, both enabled and disabled. No code constants. Default-open only for asset classes with zero rows; allowlist mode requires full coverage.
- **Per-strategy thresholds** (`module_constants.strategy.<name>` rows) — author asset-class-explicit row for any threshold using ATR multipliers, absolute % moves, or distance-in-units. Wildcard-keep for scale-free pattern geometry. Document inline.
- **SQE thresholds** (`module_constants.sqe_config.<assetClass>.*` rows) — `min_final_score`, `min_regime_weight`, `adx_min`, `di_min_quant`, `di_min_pattern`, `momentum_min`. Asset-class-explicit by default.
- **Global filter row** (`screener_filters` with asset-class scope) — `min_volume`, `min_price`, `max_price`, `max_bid_ask_spread`, `min_market_cap`, `exclude_stablecoins`, etc. Per-mode (paper + live) rows.
- **Family-IMF rows** (`screener_filters` with `filter_path IN ('vts_trend','vts_reversal','vts_breakout','vts_oscillator','vts_strong_trend','active_*')` + asset-class scope) — 5 family paths × 2 modes = 10 rows. LQ_MIN, VN_MAX, DI_MIN, DI_MAX per family.
- **MCE config** (`module_constants.mce_config.<assetClass>.*`) — `macro_modifier` (placeholder 1.0 if no asset-class-specific feed yet; track future-batch in RUNNING_ISSUES).
- **TEC / trailing config** (`module_constants.trailing_exit.<assetClass>.*`) — `break_even_enabled`, `target_lock_r`, `trail_distance_atr_multiplier`, moonbag knobs, BE-trigger threshold. Asset-class-explicit by default; do NOT inherit crypto's Variant K (BE off) blindly — equity exit behavior may want BE protection ON even when crypto has it OFF.
- **Pattern pool gates** (`module_constants.pattern_pool_gates.<assetClass>.*`) — `final_score_floor`, `max_position_pct`.
- **Data freshness window** (`module_constants.market_data.<assetClass>.data_freshness_window_ms`).

**Critical:** the unique index on every `module_constants`-adjacent table must include `asset_class` as a key column. If the table has `(mode, filter_path)` unique without asset_class (like `screener_filters` pre-B79.0m.a), seed rows for the new asset class will silently fail on `ON CONFLICT DO NOTHING`. **Audit `pg_indexes WHERE tablename='<x>'` in Step 2 pre-audit and add a hotfix migration if needed.**

#### Composite asset-class indexes on aggregator-read tables (BATCH_82 standing rule)

In addition to unique-index seeding above: every aggregator-read table with an `asset_class` column AND time-based filtering (e.g. `regime_factor_alternates`, `exit_strategy_alternates`, `signal_eval_archive`) MUST have a composite `(asset_class, <time-column> DESC)` index. Without it, the aggregator's `WHERE asset_class = $X AND <time> >= ...` query does a full-window scan with a post-bitmap-scan `Filter` on asset_class — 32+ seconds on 24k-row tables. With the index, sub-millisecond.

**Naming convention:** `idx_<table>_asset_<timecolumn>`. Example: `idx_exit_strategy_alternates_asset_created`, `idx_regime_factor_alternates_asset_evaluated`.

**Partial-index discipline:** if the aggregator's query includes `AND <some_predicate> IS NOT NULL` (e.g. `replay_completed_at IS NOT NULL`), the index should be partial with the same predicate. Smaller index, faster query — but the partial predicate must intersect with actual query WHERE; verify via `EXPLAIN ANALYZE` at deploy time that `Index Cond` (not `Filter`) carries the asset_class predicate.

**Drizzle txn-mode gotcha:** `CREATE INDEX CONCURRENTLY` CANNOT run inside a transaction block. Drizzle's default migration runner wraps each file in BEGIN/COMMIT, breaking `CONCURRENTLY`. Recommended path: raw SQL script at `server/migrations/manual/B<NN>_<description>.sql` applied via `psql` outside the Drizzle runner. Idempotent with `IF NOT EXISTS` guard. Rollback SQL co-located at `server/migrations/manual/B<NN>_<description>_rollback.sql`. Reference: `server/migrations/manual/B82_asset_class_indexes.sql`.

**Pre-launch check:** for each aggregator-read table, run the aggregator's representative query under `EXPLAIN ANALYZE` BEFORE the new asset class starts emitting. If `Filter:` (not `Index Cond:`) appears on the asset_class predicate, build the index in the same batch that wires the new class. The 38-133s endpoint timings in B-NEW-28 came from skipping this check.

#### Step 2 — Scanner + filter ownership decision

Decide explicitly: does the new asset class get its own scanner + own filter path, or share with an existing class?

**Phase 24 verdict for xstock_spot:** DEDICATED scanner + DEDICATED filter pipeline. Reasoning: telemetry isolation, market-hours-aware scanning, dollar-volume distributions materially different from crypto. Same answer expected for B80 crypto_perp (funding-window cycles, leverage-tier differences).

If dedicated:
- New `<asset_class>/scanner.ts` owns the cycle (subscription to centralClock, NOT a parallel setInterval — per B79 rev 5 §C)
- New `<asset_class>/global-filter.ts` runs asset-class-specific global filter on fresh pairs
- New `<asset_class>/imf-evaluator.ts` runs the 4 quant family-IMF paths + the pattern path
- Each step emits its own diagnostic counters (no co-mingling with crypto's fx5-scanner counters)

If shared (rare — only for asset classes with truly identical signal distributions):
- Extend `fx5-scanner.ts` to accept assetClass param at every internal boundary
- Add asset-class-aware family-row lookup (already in place via `getScreenerFilters({mode, filterPath, assetClass})` post-B79.0m.a)

#### Step 2b — Crypto-parity scanner defenses (MANDATORY for every dedicated scanner)

> Distilled from xstock_spot trial-and-error 2026-05-12. Every new dedicated scanner must implement these from day one. Missing any of them produces the exact "scanner wedges, UI shows zeros forever, every cycle times out" failure mode the xstock pipeline hit.

1. **Cycle-scoped config cache** — Load every `screener_filters` row (1 global + 1 pattern + 5 family = 7 rows for a standard quant+pattern setup) ONCE at the top of `runCycle`. Pass through to filter functions as a config bundle. **Do NOT call `storage.getScreenerFilters` inside the per-pair eval loop** — it's the N+1 query that saturates the connection pool. Reference: `fx5-scanner.ts:737-815` for the crypto pattern; `server/asset_classes/xstock_spot/eval-cycle.ts:loadXstockFilterConfigs` for the xstock implementation.

2. **`SCAN_TIMEOUT_MS` + `Promise.race`** — Wrap `runCycle(tick)` in `Promise.race([cyclePromise, timeoutPromise])` where the timeout is **strictly less than the scan interval** (e.g. 25s timeout for 30s interval). On timeout, force-reset `isScanning = false` in the `.catch` so the next scheduled tick can start fresh. Reference: `fx5-scanner.ts:572 + 604-624` (crypto); `scanner.ts` xstock implementation. **Without this, one slow cycle wedges the scanner forever** — every subsequent 30s tick SKIPs because isScanning stays true, no recovery path.

3. **Pair-batch rotation when universe > budget** — If the asset class universe size × per-pair eval cost exceeds the `SCAN_TIMEOUT_MS` budget, implement round-robin rotation. Each cycle scans a fixed batch (e.g. 75 pairs); a `rotationCursor` advances through the universe over multiple cycles for a full sweep. **Always pin index benchmarks every cycle** (5 names max) so portfolio-level signals never wait for rotation. Reference: xstock scanner.ts `CYCLE_BATCH_SIZE = 75`, `PINNED_BENCHMARKS`, `rotationCursor`. Trade-off: each non-pinned pair evaluated every N cycles instead of every cycle — accept in VTS observation phase; revisit when active trading turns on.

4. **Pinned-benchmark sanity check** — Whatever symbols you pin must actually exist in the asset class universe. xstock initially pinned 5 (SPY/QQQ/IWM/DIA/GLD) but IWM and DIA aren't tokenized — silently filtered out by `symbolList.includes()`. **In Step 2 pre-audit, verify each pinned symbol against the asset class's `<class>-universe.json`**.

5. **Constant-name canonicalization** — Before writing ANY `getCachedNumberRequired('<module>', '<constant_name>', ...)` call site, grep the existing codebase + DB for the canonical constant_name. xstock spent hours debugging massive log spam from `directional_integrity.di_to_pwin_scaling_factor` (a typo) when every other site used `di_pwin_factor`. **Pre-audit must grep `getCachedNumberRequired` across the new asset class's code path** and cross-check against `SELECT DISTINCT constant_name FROM module_constants WHERE module_name = '...'`.

6. **Bid/ask spread filter source pattern** — When adding spread filtering, DO NOT add `bid`/`ask` columns to the main ticker_snap SELECT used for the freshness gate. xstock tried that and the query plan blew up 130× (141ms → 18.5s) because the new columns required heap reads on a heavily-written partitioned table. The right pattern: a **separate small batched query** for bid/ask keyed by symbol, executed AFTER the freshness gate so it runs on the survivor set only. **Currently unimplemented; tracker `B-NEW-14`.**

7. **OHLC fetch — pre-warm batched at cycle start, or per-symbol cache with TTL** — Two valid patterns:
   - **Pre-warm batched** (xstock pattern, recommended when source is own DB): single `SELECT ... WHERE symbol = ANY([survivors])` query at top of cycle, populate a Map, eval reads from Map. Single DB roundtrip per cycle.
   - **Per-symbol TTL cache** (crypto pattern, required when source is rate-limited external API): `OHLCCache` class with Map + TTL, miss-path fetches upstream. TTL calibrated to candle interval (5min for 60min candles; 25s for 1min candles — must be < candle close interval to avoid stale-bar serving).
   - **NEVER do per-pair sequential reads inside the eval loop without one of these layers**. That's the xstock pre-2026-05-12 anti-pattern.

8. **NO silent fallbacks** — Pre-warm batched queries, config bundle loads, etc. MUST hard-fail loud (log + alert) on error. **Do NOT fall back to per-symbol queries on batch failure** — that re-introduces the N+1 pattern the batched query was designed to kill. Add a test that breaks if a fallback path appears. Reference: NO PATCHES doctrine (CLAUDE.md §5 #15).

9. **Symbol normalization consistency** — Verify the symbol key format is byte-identical across: archiver writes → ticker_snap rows → OHLC table rows → cache keys → eval loop comparisons → strategy detect calls. Mismatches here are silent killers (cache always misses; eval skips symbols nobody notices). Pre-audit step: log a single symbol's hex bytes at each boundary and confirm equality.

10. **Connection pool sizing for worst case** — The Supabase / Postgres pool must handle the cycle's worst-case concurrent query count. With pre-warm + per-pair OHLC + config bundle reads + concurrent ticker writers, peak demand can spike. Pre-audit step: count the queries per cycle, multiply by concurrent asset-class scanners running, verify pool size > peak. xstock saw `ticker-batch-writer: pool slot timeout (5s)` for hours under N+1 + heavy ticker writes.

11. **Central clock subscription, NOT setInterval** — Always subscribe to the shared `centralClock` and gate execution on `tick.tickNumber % SCAN_INTERVAL_SECONDS === 0`. Same boundary as every other scanner (crypto + xstock both fire at tick 30, 60, 90, ...). Do NOT spin up an independent `setInterval` — they drift and create non-deterministic load patterns.

12. **`isScanning` early-return** — Set `this.isScanning = true` BEFORE `runCycle()` starts, reset in a `finally` block. Every tick handler should `if (this.isScanning) return;` to prevent re-entry. The `SCAN_TIMEOUT_MS` (defense #2) provides the escape valve when something takes longer than expected.

#### Step 3 — Post-filter survivor handoff (shared eval surface, NOT a carve-out)

After filtering, surviving pairs flow into the SHARED post-filter eval functions. These already exist as DB-driven modular units (Phase 18 + B78 + B79.0m.a):

| Function | What it does | Asset-class driven by |
|---|---|---|
| `computeMarketContext` (MCE) | Regime, indicators, DBS (where applicable) | Asset-class-aware module_constants lookups |
| `callStrategyDetect` / strategy-engine `detect*` methods | Per-strategy detection logic | `module_constants.strategy.<name>` thresholds, DB-driven |
| `evaluateSignalQuality` (SQE) | Eligibility gates, finalScore, regimeWeight | `module_constants.sqe_config.<assetClass>` + `strategy_gates.<assetClass>.<strategy>.enabled` |
| `insertOpenTrade` + `signal_eval_archive` INSERT | Persist outcomes with `asset_class='<class>'` tag | Caller threads assetClass into row |
| `resolveTECConfig(assetClass)` | TEC trailing/BE config per asset class | `module_constants.trailing_exit.<assetClass>` |

The new asset class's scanner calls these functions IN A LOOP for each surviving pair, passing `assetClass='<class>'`. No extraction from `runPhase10SimulationCycle` required — that monolith stays crypto-only.

#### Step 4 — Hidden crypto-assumptions audit on shared functions (MANDATORY before wiring)

For each shared function in the post-filter chain, audit:

**Q1.** Are there hardcoded crypto assumptions inside that need asset-class gating?
- BTC OHLC reference (defensive_hedge, multi-TF correlation) — gate by `assetClass === 'crypto_spot'`
- BTC dominance / mcap momentum / funding rate (B67.1 macro) — these read from `macro_modifier` DB row which is per-asset-class; xstock should resolve to its placeholder 1.0 (or actual equity macro feed when B79.3 ships)
- Hardcoded symbol filters / quote-currency assumptions — grep for string literals `'/USD'`, `'BTC/'`, `'/USDT'`
- Stablecoin gate — applies to crypto, N/A for xstock

**Q2.** Are there things UNIQUE to crypto that should NOT run for the new asset class?
- DBS computation (`directional-bias-store`) — runs for crypto on every cycle; xstock has no DBS today. The post-filter chain must accept `dbs=null` and treat as neutral multiplier=1.0. Grep every strategy detect function: does each handle `dbs === null`?
- Pattern detector tuned-for-crypto-microstructure parameters — verify pattern shapes are scale-free (they are; the geometry doesn't care about absolute price level)
- 24/7 trading assumptions — replaced with `is<AssetClass>MarketOpen` predicate gate (xstock has `isXstockMarketOpenUTC`; the eval cycle should NOT process pairs when market closed)

**Q3.** Are there things UNIQUE to the new asset class that need NEW functionality?
- Market-hours gate (xstock: ARCA RTH + Phase-1 extended-hours rules per B79.0L)
- Sector classification (xstock: equity sector for portfolio-cluster prevention — B79.6 future, but stub in registry now)
- Fundamentals / earnings / IV (xstock: deferred to a future batch, but flag if any current strategy assumes presence)
- Asset-class-specific friction model (B69 + B79: `server/asset_classes/<class>/friction.ts`)
- Macro-feed input source (B79.3 for xstock: VIX + SPY trend; B79.0m placeholder 1.0)
- Funding-rate handling (B80 crypto_perp: funding windows + position-flip-on-funding-cost)

**Q4.** Setup-hash, log-tag, metric-tag, and other shared global state:
- Setup-hash key (`lastSetupHash` Map in vts-runner) — must include assetClass in the key composition to prevent cross-asset collisions
- Every log line emitted from shared functions — must include `asset_class` field/tag so crypto and the new asset class telemetry don't conflate
- Every metric — same
- Counter accumulators (`vtsEvalCounters`) — must be partitioned by asset class OR explicitly not-applicable per asset class

**Q5.** Exit path cleanliness:
- Trailing-exit-controller (TEC) — `resolveTECConfig(assetClass)` already exists; verify config rows seeded for the new class
- Exit-evaluation cycle — when an xstock trade exists in `vts_open_trades`, the exit loop must pull OHLC from the asset-class-correct table (`xstock_spot_ohlc_1m` not `crypto_spot_ohlc_1m`)
- Close-time persist — `markOpenTradeClosed` is asset-class-agnostic (good); JSON ledger write is asset-class-agnostic (good)
- B73 ablation replay + B70 archive — async, scoped via asset_class column, no per-class code needed

#### Step 5 — Diagnostic UI separation (NO co-mingling)

Each asset class gets its own observation tab in Machine Learning. Filter Diagnostics counters from one asset class MUST NEVER appear in another asset class's tab.

- Endpoint isolation: `/api/<assetClass>/filter-diagnostics` returns ONLY that asset class's counters
- Existing crypto Filter Diagnostics tab continues to read `/api/vts/filter-diagnostics` which is crypto-only by-construction (fx5-scanner only scans crypto)
- Step 2 pre-audit must explicitly grep for cross-asset-class data leaks (e.g. an aggregator that doesn't filter by `asset_class` could leak xstock rows into crypto's Drift Dashboard if signal_eval_archive started accumulating xstock rows; this is exactly the B78 "drift-dashboard-aggregator gets `AND asset_class='crypto_spot'` filter" pattern — verify the same pattern applies to every diagnostic aggregator)

#### Step 6 — TEC + trailing + BE settings (asset-class-explicit, do NOT inherit crypto)

Each new asset class explicitly decides TEC behavior. Defaults that differ per asset class:
- `break_even_enabled` — crypto Variant K = OFF; equity microstructure may want ON (test in shadow mode)
- `trail_distance_atr_multiplier` — different per asset class typically
- `target_lock_r` — different per asset class typically
- Moonbag knobs — pure trade-mode policy, may transfer cross-class

Seed asset-class-explicit `trailing_exit.<assetClass>.*` rows during Step 1; verify `resolveTECConfig(assetClass)` returns the right rows in Step 2 PIA.

#### Step 6b — Calibration cycle (MANDATORY post-deploy, before declaring asset class production-ready)

> Distilled from crypto + xstock onboarding experience (Kyle directive 2026-05-13). Initial Layer-1 seed values are domain-knowledge starters, not production-tuned. Empirical calibration is required before the asset class is treated as functional. Skipping this step is the root cause of "we shipped the asset class but no trades flow / wrong trades flow" — exactly what xstock surfaced.

Three calibration sub-cycles MUST run, each with its own observation window + tuning step:

**Sub-cycle 1 — Regime classifier calibration**
- Observation: monitor the asset class's regime distribution across its universe over 24-72h of live data.
- Expected anti-pattern: pairs heavily concentrated in 1-2 regimes (e.g. crypto initially over-classified to RANGE_BOUND_STABLE; xstock will likely over-classify to TREND_FRIENDLY_STABLE / STRUCTURAL_TRANSITION during RTH).
- Tuning surface: `module_constants.regime_classifier.<assetClass>.*` thresholds (momentum / volatility / ADX / trend-strength bands). These were authored in Step 1 — Sub-cycle 1 verifies they produce reasonable distributions.
- Reference: crypto saw a big shift from range_bound concentration to predominantly strong_trend after Layer-3 retune. Expect similar redistributions for any new asset class.
- Exit criterion: regime distribution roughly matches the expected market behavior for the asset class (no regime > 70% of population unless deliberate).

**Sub-cycle 2 — Filter threshold reality check**
- Observation: examine the xStocks-style Filter Diagnostics panel for the new asset class over 24h.
- Verify every applicable filter is binding meaningfully (rejecting at least some pairs) OR is set to permissive-by-design (e.g. `max_price` for fractional-ownership assets).
- Expected anti-pattern: most filters at 0% rejection (too permissive, like xstock's $1 min_price for $200 TSLAx pairs) OR one filter rejecting >70% (too tight, like xstock's DI gate on reversal/oscillator families).
- Tuning surface: `screener_filters.<assetClass>.<filter_path>` rows (min_price, min_volume, max_bid_ask_spread, LQ/VN/DI bands per family).
- Exit criterion: each filter row's failure % is defensible — either zero (intentionally permissive) or measurable rejections that the operator can explain.

**Sub-cycle 3 — Strategy gate testing**
- Observation: over a multi-day window, monitor the By Strategy panel for the new asset class.
- Verify every DB-enabled strategy fires at least once. Dormant strategies are acceptable ONLY if their gating reason is documented (regime never hit during observation window, market-hours gate excludes them, etc.).
- Expected anti-pattern: IMPULSE_EXPANSION-mapped strategies stay at 0 even when IE regime hits other strategies (xstock surface — ORB fires under IE, but sma_trend_ride / breakout / vwap_bounce stay dormant, suggests a separate IE-routing audit).
- Tuning surface: `strategy_gates.<assetClass>.<strategy>.enabled` rows + per-strategy thresholds in `module_constants.strategy.<name>.*` + family eligibility map.
- Exit criterion: each enabled strategy has either (a) fired ≥ 1 signal in the observation window, OR (b) a documented gating explanation (regime never hit, market-hours, family eligibility).

**Calibration tracker discipline:** each sub-cycle produces a deltas log in the asset class's diagnostics tracker (e.g. `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` for xstock). Every threshold change must be a DB UPDATE migration with `last_updated_by='<batch>-calibration-N'` so the audit trail survives across operator handoffs.

**Pre-flight check — before declaring the asset class production-ready:**
- All 3 sub-cycles run + passed exit criteria → asset class can move to Phase 19 active-trading consideration
- Any sub-cycle still failing → asset class stays in passive-learning VTS mode; document the open calibration items in the asset class's diagnostics tracker

#### Step 7 — Active-trading path wire-in (signal orchestrator + paper execution)

Separate batch (B79.0n pattern). Wires the post-filter survivors into `signal-orchestrator` for the active-trading dispatch path with asset-class-aware execution. Can be designed and shipped while active trading is OFF (verifiable up to the Phase 19 gate); full end-to-end testing waits for Phase 19.

### The pre-audit discipline

Step 4 above (hidden-assumptions audit) is the discipline B79 lacked. Every shared function in the post-filter chain needs grep-and-verify on Q1-Q5 BEFORE wiring code lands. Function-by-function. Document the answers in `BATCH_N_PRE_AUDIT.md` §"Shared function audit".

This is the difference between "told the user it worked when it didn't" (B79.0a → B79.0d) and "verifiable, defensible, complete" (post-B79.0m.a).

---

### Step 4.5 — Writer-side asset-class threading audit (BATCH_82 standing rule, 2026-05-14)

Distilled from the 5-incident crypto-first / asset-class-lost run (B-NEW-20/22/25/26/28) culminating in BATCH_82. **Every persistence site that writes the `asset_class` column must accept the value as a typed parameter from the caller. NO hardcoded literals. NO `?? 'crypto_spot'` fallbacks. The structural fix is type-system enforcement, not silent fallback.**

#### What to check at pre-audit (every asset-class onboarding, no exceptions)

Run the following grep across `server/services/` AND `server/scripts/` AND `server/tests/`:

```bash
grep -rn "asset_class" server/services/ server/scripts/ server/tests/ shared/
```

For every site that returns matches, verify:

1. **Schema (`shared/schema.ts`)** — column exists with NOT NULL constraint.
2. **Writer site (INSERT or UPDATE on the column)** — does the value come from a typed parameter, or is it a hardcoded literal / `??` fallback? If the latter, this is a future incident waiting to fire. Refactor to type-system-enforced caller-resolves: parameter is REQUIRED (no default), TypeScript compile fails if any caller forgets.
3. **Reader site (SELECT where the column is in WHERE / GROUP BY / aggregation)** — does the function accept `assetClass` parameter, or is it implicitly crypto-only? If implicit, every panel + aggregate breaks silently when the new asset class arrives — they'll either return crypto-only data with the wrong label OR throw on the new class.
4. **Downstream consumer (ML pipeline, weekly digest, training-export script, etc.)** — does any consumer have an implicit `WHERE asset_class = 'crypto_spot'` filter that would silently exclude the new asset class? If so, the writer fix correctly tags new rows but the reader silently skips them.

Document the inventory in `BATCH_N_PRE_AUDIT.md` §"Writer/reader asset-class enumeration". For BATCH_82 the inventory was 2 writers (factor-ablation-emitter, exit-strategy-replay-service) + 2 readers (drift-dashboard-aggregator, exit-strategy-ablation-aggregator) + 1 indirect consumer (replay-ablation.ts script — already asset-class-agnostic). No ML pipeline / digest / export reads either table — clean downstream.

#### Standing recipe — type-enforced caller-resolves

```ts
// BAD — silent fallback to crypto_spot
function emitWriter(..., assetClass: string = 'crypto_spot') { ... }
function emitWriter(...) { ...
  const row = { asset_class: ctx.assetClass ?? 'crypto_spot' };  // ← silent fallback
}

// GOOD — type-system-enforced caller-resolves
function emitWriter(..., assetClass: AssetClass) { ... }  // REQUIRED, no default
function emitWriter(ctx: { assetClass: AssetClass }) { ... }  // non-nullable on the type
```

For READER-side aggregators, the pattern is different — they may legitimately want to default to a baseline asset class for backward-compat. Use an optional parameter with a sentinel that means "all classes" rather than a hardcoded primary-class default:

```ts
// GOOD — explicit "all" semantic
function computeAggregate(window: Window, assetClass: AssetClass | null = null) {
  // When assetClass is null, no WHERE filter on asset_class — returns all classes
  // When assetClass is provided, adds AND asset_class = $X
}
```

#### Why this matters

Every silent fallback to `'crypto_spot'` is a future incident. The xStocks expansion produced 5 of them in 4 days because writer sites were crypto-first by default. Each incident took live observation + Kyle screenshot + diagnostic session to surface. **Pre-launch enumeration via this audit collapses the 5 reactive incidents into one proactive grep.**

---

### Step 4.6 — Block-scope identifier renaming (BATCH_82 + B83 lesson, 2026-05-14)

Distilled from the B83 hotfix (24hr silent pipeline stall, 85-trade backlog). **NOT asset-class-specific** — applies to every refactor — but worth flagging here because asset-class onboarding refactors are exactly when this anti-pattern fires.

**The bug:** TypeScript does NOT enforce block-scope-only identifier visibility for for-loop iteration variables. If you rename a for-loop variable AND there's an outer-scope identifier with the same OLD name, TypeScript silently resolves references to the OLD name against the outer scope. At runtime, JS throws `ReferenceError` — but only when the for-loop body actually executes.

**The recipe:** when renaming an identifier referenced inside a for-loop body, the variable used inside MUST match the loop's destructure pattern explicitly. Don't rely on TypeScript scope inference. Add the rename to the inventory file at `Claude Comms and Packages/Change Lists/rename-inventory-<batch>.md` (5-step protocol in SIM "Rename invariants" section): pre-rename grep → per-row decision → post-rename verification grep.

For asset-class onboarding specifically: when you rename a for-loop variable in `vts-runner.ts` / `signal-orchestrator.ts` / any shared-engine file, audit the entire loop body for references to the OLD name before committing. Block-scope is unforgiving.

---

### Step 4.7 — Scan-cycle read-side data-completeness audit (B-NEW-14 lesson, 2026-05-14)

Distilled from B-NEW-14 (xstock_spot `max_bid_ask_spread` gate sitting inert for ~3 days while the threshold was alive in the DB).

**The pattern, plainly:** the snapshot table that the scan reads from is populated by an upstream background job that captures EVERY field the exchange returns — bid, ask, last, volume, high, low, etc. The scan's read query, however, typically only asks for the subset of columns the FIRST iteration of the scanner needed. If a threshold gets added to the DB later (or was always intended but stubbed) and its source column wasn't in the original SELECT, the gate silently no-ops while the threshold misleads anyone reading the DB into thinking the gate is live.

**Mandatory check at onboarding (rev-N pre-audit):** before declaring the global / pattern filter complete, run the following inventory:

1. List every column in the snap table (or live ticker payload for non-archive asset classes).
2. List every filter threshold defined in `screener_filters` for the new asset class (every `min_*` / `max_*` / `excludes_*` column with a non-null, non-zero value).
3. For each threshold, identify which column from #1 the filter would need to read to evaluate it.
4. Verify the scan-cycle read query (or the live ticker call) actually SELECTs every such column.
5. If any column is missing, ADD it to the SELECT BEFORE shipping the filter. Cost: usually zero (DB query plan unchanged for additional output projections on indexed reads — empirically tested 2026-05-14 on `xstock_spot_ticker_snap` snap: 40-43ms whether bid/ask is included or not on 25-75 symbol IN-clauses).

**The standing rule:** "every threshold that lives in the database must have its corresponding data column read by the scan-cycle SELECT (or by whatever the equivalent data fetch is for that asset class). A threshold in DB without a matching column read is a silent no-op gate — strictly forbidden."

**Why this is non-negotiable:** the failure mode is silent. The diagnostic panel keeps reporting "zero rejections" on a row whose threshold was set with intent. Nobody knows the gate isn't working unless they go re-read the source. B-NEW-14 sat in this state for ~3 days; the same trap will fire on the next asset class if this step is skipped.

**Mirror semantically across feed sources.** For asset classes that read from a live exchange ticker call (e.g. crypto via Kraken REST/WS), the same rule applies — the ticker call response shape must include every column whose threshold lives in DB, or the scanner must augment with a separate call. The pattern is feed-source-agnostic: same data shape, different transport.

---

### Step 4.8 — Dynamic universe discovery (B79.0n.UNIVERSE-DISCOVERY canonical pattern, 2026-05-21)

**Standing rule:** if the exchange has NO public list-all endpoint for instruments in this asset class, scope dynamic discovery as a **first-tier batch in the onboarding sequence (not a follow-up)**. Hardcoded registries are a structural cost that compounds — every new instrument the exchange adds is a manual maintenance task, and operators have zero visibility into newly-supported names without an out-of-band audit. The xstock_spot worked example (B79.0n.UNIVERSE-DISCOVERY) is the canonical pattern.

**The three-service discovery chain (canonical shape):**

| Role | Function | Example (xstock_spot) | Generalization (next asset class) |
|------|----------|------------------------|------------------------------------|
| **Prime mover** | Cheap, public, by-issuer catalog. Answers: "what instruments exist in this product family?" | CoinGecko `xstocks-ecosystem` category (no API key, 126 candidates) | For crypto-perp: Kraken Futures REST `/derivatives/api/v3/instruments`. For the next class: identify the publisher's free public catalog endpoint. |
| **Ground truth** | Exchange's accept/reject mechanism. Answers: "does the exchange actually stream/trade this pair right now?" Binary result. | Kraken WebSocket subscription probe at `wss://ws-equities.kraken.com` (chunked 100/batch + 500ms inter-chunk sleep + 15s collection window + 10s WS-open timeout) | For crypto-perp: Kraken Futures WS channel-subscribe. For the next class: identify the exchange's accept-or-reject mechanism (REST `info` call, WS subscribe attempt, etc.). |
| **Enrichment** | Per-symbol metadata (sector, GICS, ADR flag, fundamentals) for grouping/filtering. Does NOT decide whether a symbol exists. | Finnhub `/stock/profile2` (~75 substring patterns across 11 GICS SPDR sectors + 3 special buckets + UNCATEGORIZED) | For crypto-perp: CoinGecko derivatives endpoint OR exchange-specific (funding rate, mark price, position-limit metadata). For the next class: identify the metadata source. |

**The 5-layer fallback chain at boot:**

1. **Live discovery** — runs at the daily cron tick + on-demand POST endpoint
2. **DB snapshot** — `initializeFromDB()` at boot reads the most recent successful `discovery_runs` cohort
3. **File cache** — `${HOME}/.dawntrader-cache/<class>-universe-cache.json` (HOME-relative, NOT `/var/lib/...` per RUNNING_ISSUES #126 + Langston Step 8 preference Option 2)
4. **Bootstrap set** — small hand-curated mega-cap fallback at `server/asset_classes/<class>/universe-bootstrap.ts` (~20 symbols)
5. **Fail-fast** — `process.exit(1)` if all prior layers fail at boot

**DB schema (canonical 3-table pattern):**

- `<class>_universe` — PK on symbol; sector with CHECK constraint (NOT PostgreSQL ENUM — sidesteps `ALTER TYPE` same-transaction restriction); `is_delisted BOOLEAN DEFAULT false`; `last_seen_at`, `first_seen_at`; metadata flags (`crypto_adjacent`, `is_adr`, etc.); `source_chain JSONB`
- `<class>_universe_overrides` — PK on symbol referencing the universe table; explicit `override_*` columns (NULL = no override); `reason TEXT`, `created_at`, `created_by`. `runDiscovery()` applies non-null override values AFTER source-chain fields are set, so curator decisions survive every re-discovery
- `discovery_runs` — BIGSERIAL `run_id`; `triggered_by` CHECK in ('cron_daily','manual_endpoint','boot_smoke'); duration_ms; symbols_discovered/stale/delisted; `source_chain_status JSONB`; `error_log TEXT`. Indexed by `started_at` for forensic queries

**Lifecycle (canonical pattern):**
- Re-discovery un-delists: `ON CONFLICT (symbol) DO UPDATE SET ... is_delisted = false`
- Stale gate: >7 days since `last_seen_at` → log `[STALE_SYMBOL]` (no DB write, log-only signal)
- Delisted gate: >30 days since `last_seen_at` → `UPDATE is_delisted = true` (removed from active universe)
- **Anchor the lifecycle on `last_seen_at` (data arrival), NOT on WS-accept.** Exchange WS subscription accept is necessary but not sufficient for active data — some symbols accept subscribes but never stream (delisted underlying / suspended / instrument inactive). This is the only reliable way to detect "the WS feed says yes but no data flows."

**Per-leg mandatory rules:**

- **Every external WS or REST call MUST have an explicit timeout AND a deterministic partial-response abort path.** WS-open timeout guard (10s recommended) prevents DNS / TLS handshake / TCP-RST-without-close-event from hanging the discovery cycle indefinitely. Collection-window timeout (15s recommended) handles silent stalls during message accumulation. On either timeout firing, the cycle writes a `partial=true` audit row and aborts — Layer 2 fallback covers.
- **Every classification heuristic MUST have parameterized regression-lock tests covering empirically-probed boundary cases + a measurement gate post-cycle + a documented expansion-trigger criterion.** Substring-collision bugs in industry-classification heuristics are inevitable; biotech-vs-technology was the obvious one; gas-vs-utility is the next likely one. Empirically-probe the live API at scope time, then lock the probe results as regression tests.
- **Use `const result: any = await db.execute(sql\`...\`)` pattern, NOT `db.execute<T>()` generic.** Drizzle's generic requires `T extends Record<string, unknown>`. Custom row interfaces that satisfy field-by-field but not the broader constraint will TS2344. Codebase-canonical pattern: cast `result.rows` to your row type at the call site.
- **Never explicitly INSERT into `_migrations` from a migration file** — the runner auto-inserts. Column name is `name`, not `filename`.
- **Any tool that assembles migration SQL from multiple source files MUST validate by `psql -f <migration> -1` against an empty schema before committing.** Single-transaction validation catches duplicate statements that succeed individually but fail in transaction order.
- **Components live under `server/asset_classes/<class>/` should be asset-class-bound by location, NOT by an optional `assetClass?:` parameter.** Optional params are silent-fallback magnets. The location is the binding.

**Test-assert range pattern:** convert exact-equality test asserts to range form (`size >= MIN && size <= MAX`) so universe growth doesn't break tests. Example from B79.0n: `expect(snapshot.size).toBeGreaterThanOrEqual(MIN_EXPECTED); expect(snapshot.size).toBeLessThanOrEqual(MAX_EXPECTED);` where MIN/MAX have headroom for natural growth (e.g., 200 / 800 for an asset class with 480 current symbols + 12-month expected growth budget).

**API trigger surface:** every dynamic-discovery batch ships TWO routes:
- `POST /api/internal/universe-discovery/refresh` (or class-scoped equivalent) — on-demand trigger; returns the full audit row from the run
- `GET /api/internal/universe-discovery/health` — counters self-check; useful for ops monitoring + Step 7 verification gates

**Cron cadence:** daily refresh at 06:00 UTC via node-cron `0 6 * * *`. Wrap the invocation in try/catch — a single failed cycle should NOT crash the process; failures should be visible in `discovery_runs.error_log` + via PM2 logs.

**Worked example for B79 xstock_spot:** see `Claude Comms and Packages/Batch Completion/B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md` for the full implementation walkthrough including code paths, source-chain timing breakdown, and 10-section retrospective.

---

### Step 4.9 — REQUIRED-assetClass storage API pattern (B79.0n.STORAGE canonical pattern, 2026-05-21)

**Standing rule:** for any storage API surface (or any module-level method) that returns asset-class-scoped configuration, the `assetClass` parameter MUST be a typed REQUIRED parameter (`assetClass: AssetClass`) — NEVER an optional with silent default. The B79.0n.STORAGE worked example (`storage.getScreenerFilters`) is the canonical pattern.

#### The pattern

```ts
// BAD — silent fallback to crypto_spot
getScreenerFilters(params: {
  mode: 'live' | 'paper';
  filterPath?: string;
  assetClass?: string;  // ← optional + defaulted to 'crypto_spot' = silent footgun
}): Promise<ScreenerFilters | null>;

// GOOD — type-level enforcement of caller-resolves
getScreenerFilters(params: {
  mode: 'live' | 'paper';
  assetClass: AssetClass;  // ← REQUIRED, no default; TS compile-error if omitted
  filterPath?: string;
}): Promise<ScreenerFilters | null>;
```

The pattern composes with three additional elements:

**1. Dedicated `getCanonicalScreenerConfig({mode, filterPath?})` helper** for UI/diagnostic display where the intent is genuinely "show the canonical crypto baseline":

```ts
async getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null> {
  // Returns the canonical crypto_spot baseline for UI display and diagnostic reference.
  // NEVER use this for runtime signal/screener/SQE routing — use getScreenerFilters({mode, assetClass, ...})
  // with the explicit asset class derived from the signal/cycle context. The whole point of REQUIRED-assetClass
  // is preventing the silent-fallback footgun this helper could become if misused.
  return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
}
```

**Use a banner-style "NEVER use this for runtime routing" docstring.** The deliberate uppercase + "NEVER" caught 3 misclassified sites at Langston's Step 4 code review (unified-filter-gateway x2 + paper-sim-service x1 were initially routed through the helper but were actually runtime crypto-trading paths; reclassified to (a) crypto-intentional explicit before deploy).

**2. Cache key extension** for any caller-side cache that previously keyed by mode alone:

```ts
// BEFORE: cache.set(mode, value)
// AFTER:  cache.set(`${mode}:${assetClass}`, value)
```

Memory cost is `O(k)` where k = number of (mode, asset_class) combinations (4 max today: paper+live × crypto+xstock). Cache-isolation regression test at `b79-0n-storage-sqe-asset-class-routing.test.ts` warms `paper:crypto_spot`, reads `paper:xstock_spot`, asserts distinct storage calls — copy this test shape for any future cache-key dimension addition.

**3. `@ts-expect-error` regression-lock test** in a dedicated unit-test file:

```ts
it('TYPE LOCK — calling getScreenerFilters without assetClass MUST be a compile error', () => {
  function callerMissingAssetClass(storage: IStorage) {
    // @ts-expect-error — assetClass is REQUIRED per B79.0n.STORAGE
    return storage.getScreenerFilters({ mode: 'paper' });
  }
  expect(typeof callerMissingAssetClass).toBe('function');
});
```

If a future refactor accidentally re-introduces the optional parameter shape, the `@ts-expect-error` directive becomes "Unused" (because the omission no longer errors) and TypeScript rejects the file. CI breaks. This is the canonical pattern for any type-system-enforced contract.

#### Why this pattern is load-bearing

**Pre-audit grep undercounts by ~20%.** B79.0n.STORAGE's initial grep identified 32 silent-fallback sites; the actual compile-driven audit found 38 (6 additional surfaced because the regex pattern matched only certain call shapes while TypeScript's reference graph captures every caller). **Rule:** treat pre-audit grep counts as **lower bounds**. TypeScript at implementation time will surface the rest.

**Same-batch migrations + WHERE clauses must be co-audited.** B79.0n.STORAGE shipped a seed migration that created 2 rows per `(mode, filter_path)` (crypto + xStock). The `upsertScreenerFilters` UPDATE WHERE clause was `(mode, filterPath)`-only — would match BOTH rows and silently cross-corrupt fields. Langston caught this at Step 4. **Rule:** when a batch ships both a schema/data change AND code that operates on that schema, the pre-audit must explicitly cross-reference WHERE/JOIN clauses against the new row population shape.

**Layer 1 vs Layer 2 distinction in DB-backed config.** Per the broader 3-layer precedence chain (Layer 1 = primary table; Layer 2 = module_constants fallback; Layer 3 = static const catastrophic fallback), B79.0n.STORAGE refactors Layer 1; per-class Layer 2 rows are typically deferred to a separate batch with explicit promote-to-active triggers (Phase 19 calibration, third asset class onboarding, or the next sub-batch in the arc begins regardless).

#### Dispatch infrastructure rule (CLAUDE.md §6.5.0.a reaffirmed)

For Langston code reviews involving diff verification: **every dispatch MUST include the no-gdrive instruction at the TOP, AND embed load-bearing diff content inline.** B79.0n.STORAGE's Step 4 RE-ACK v1 dispatch hung 10+ min on `git -C /mnt/gdrive ... grep` FUSE I/O — D-state stuck processes can't be kill -9'd. v2 dispatch with embedded-diff inline + explicit `DO NOT git-grep against /mnt/gdrive — use ssh deploy@188.245.193.8` instruction at the top completed cleanly. **Even when Langston has been told before, the prompt structure drives behavior.** Codify in every dispatch.

#### Where this pattern came from

B79.0n.STORAGE worked example (deploy `ab3153ce5`, 2026-05-21). See `Claude Comms and Packages/Batch Completion/B79_0n_STORAGE_COMPLETION_REPORT.md` §10 for the full set of onboarding learnings + concrete code references.

---

### Step 4.10 — REQUIRED-assetClass on compute-side / math surface APIs + fail-hard exhaustive switch + wildcard-retirement migration (B79.0n.MCE canonical pattern, 2026-05-22)

**Standing rule:** Step 4.9 covered the *storage / data-access* layer. B79.0n.MCE extends the same REQUIRED-assetClass discipline to the *compute / math* layer — regime classification (`calculatePairRegime`), the Market Context Engine (`computeContext`), and the cost model (`getFrictionForAssetClass` + friends). The pattern is the same (typed REQUIRED parameter, no silent default), with three compute-layer-specific additions.

#### Addition 1 — Fail-hard exhaustive switch for asset-class enum branching

When a function branches on `assetClass` to select a per-class artifact (a friction model, a threshold set), use a TypeScript-exhaustive `switch` with a `never`-typed default — NOT a warn-once-fallback:

```ts
// BAD — warn-once-fallback silently degrades to crypto behavior
function getFrictionForAssetClass(assetClass: string = 'crypto_spot'): FrictionModel {
  switch (assetClass) {
    case 'crypto_spot': return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot': return XSTOCK_SPOT_FRICTION;
    default:
      if (!_warned) { console.warn('unknown assetClass; falling back to crypto'); _warned = true; }
      return CRYPTO_SPOT_FRICTION;   // ← silent wrong answer
  }
}

// GOOD — REQUIRED param + fail-hard on unwired classes + compile-time exhaustiveness
function getFrictionForAssetClass(assetClass: AssetClass): FrictionModel {
  switch (assetClass) {
    case 'crypto_spot': return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot': return XSTOCK_SPOT_FRICTION;
    case 'crypto_perp':
    case 'xstock_perp':
      throw new Error(`[batch][cost-model] assetClass='${assetClass}' has no friction model wired — file as RUNNING_ISSUES + add to scope before consuming`);
    default: {
      const _exhaustive: never = assetClass;   // ← compile-fails if AssetClass gains a value
      throw new Error(`[batch][cost-model] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}
```

Two things this buys: (a) the `const _exhaustive: never` line is a compile-time tripwire — if a future asset class is added to the `AssetClass` union without a `case`, the file fails to compile; (b) the explicit `throw` on a not-yet-wired class is a *forcing function* — when perpetual-futures onboarding begins, the throw makes the missing friction-model work immediately visible instead of letting a wrong value flow silently. This is the canonical recipe; the warn-once-fallback is the anti-pattern.

#### Addition 2 — Cache-key extension at compute-side singletons

Same shape as Step 4.9's storage-side cache-key extension, applied to a compute singleton. The Market Context Engine's per-symbol context cache key went `${symbol}` → `${symbol}:${assetClass}`. Generalize: **any compute-side cache whose key is a primary identifier (symbol, mode, pair) gains the `assetClass` dimension as `${primaryId}:${assetClass}`.** Memory cost is `O(k)` (k = number of asset classes, bounded ≤ ~10). Note that a single subsystem can own *multiple* cache layers with different keys — be explicit about which one is being extended (the MCE owns three: per-symbol context, module-constants rowset, 9-group config refresh; B79.0n.MCE extended only the first). Document the cache-layer inventory so the next onboarding does not conflate them.

#### Addition 3 — Wildcard-retirement migration for `module_constants` levers (Layer-2 per-class promotion)

When a `module_constants` lever is seeded at global wildcard `(*, *, *, *)` scope but is consumed by an asset-class-aware caller, the wildcard row itself is a silent-fallback footgun — every asset class resolves to the same shared row. The resolver's wildcard support is correct as a *feature*; the *data shape* (one wildcard serving classes that need independent values) is the bug. **Fix at the data layer, not the resolver.** Canonical migration shape (B79.0n.MCE worked example, `dbs_calculation.min_sample_count`):

1. Add an explicit `crypto_spot` row cloning the wildcard value byte-for-byte (crypto-by-construction-NONE invariant).
2. Add an explicit `xstock_spot` row (placeholder-cloned at seed; per-class calibration replaces it later).
3. Retire the wildcard via an **`EXISTS`-gated `DELETE`** that fires only after both class rows are confirmed present — **no orphan window** where the wildcard is gone but the class rows do not yet exist.

Implementation rules: wrap in a single `BEGIN/COMMIT`; inserts use `ON CONFLICT ... DO NOTHING` + the `EXISTS`-gated DELETE for idempotency; scope every WHERE clause to the exact `constant_name` so a sibling constant under the same module (e.g. B-PHASE-A2's `dbs_calculation.sector_coverage_floor`) cannot be collaterally retired; ship a manual-only `*-rollback.sql` companion; and ship the resolver-key-tightening code change and the migration **in the same commit** (tightening-first hard-fails until rows exist; seeding-first leaves the wildcard live for an interim). Net row delta for a single-constant single-variant retirement is **+1**.

#### Why this pattern is load-bearing

**Type-enforced REQUIRED-assetClass catches silent-fallback bugs at compile time.** B79.0n.MCE made `assetClass` REQUIRED on five surface APIs; the TypeScript compiler then enumerated every caller (`getCachedCostMetrics` alone had 9 production callers all passing only `symbol` — an active footgun that would have routed every xStock signal through crypto friction once active-trading enabled). The compiler is a more reliable audit tool than a grep — same lesson as Step 4.9, reaffirmed.

**`grep` false-positive on `assetClass: <var>`.** A grep for the wildcard literal `assetClass: '*'` to find silent-fallback resolver sites produces *false positives* — a site already written as `assetClass: someVariable` (correctly per-class) reads, at a glance, like a candidate. B79.0n.MCE pre-audit v1 flagged `directional-bias-store.ts:59` for resolver-key tightening on exactly this basis; a direct code read showed the parameter was already per-class-resolved (B-PHASE-A2 had shipped it 4 days earlier). **Rule:** never flag a resolver-key site from a grep hit alone — open the file and confirm whether the `assetClass` field is a literal `'*'` or a passed variable before scoping work to it.

**Dead inline code chains awaken latent bugs / hygiene debt.** B79.0n.MCE pre-audit v2 found that `cost-metrics.ts`'s `getDefaultAvgReturn → updateCostData → getTransactionCostFactor` chain had zero production callers — an orphan from an earlier directive era that B72 had nonetheless migrated a `module_constants` row for. The dead chain was deleted (Q-VI option a); the now-orphaned `cost_model.default_avg_return` row + a stale `b72-warmup.ts` prefetch entry were filed as RUNNING_ISSUES cleanups. **Rule:** every onboarding pre-audit must include a "dead code awakens / dead code lingers" check — when a REQUIRED-assetClass refactor touches a subsystem, grep the subsystem for functions with zero production callers; they are either deleted in-batch (small + contained) or filed as tracked cleanup. Do not leave orphan code + orphan DB rows undocumented.

#### Where this pattern came from

B79.0n.MCE worked example (deploy `aa0564107`, 2026-05-22). See `Claude Comms and Packages/Batch Completion/B79_0n_MCE_COMPLETION_REPORT.md` §10 for the full set of onboarding learnings + concrete code references; see `SYSTEM_MANUAL.md` Configuration Surface appendix for the wildcard-retirement migration pattern + the MCE three-cache-layer model.

---

### Step 4.11 — Pattern recognition primitives REQUIRED-`assetClass` discipline (B79.0n.PATTERN-DETECT canonical pattern, 2026-05-24)

**Standing rule:** the same REQUIRED-`assetClass` discipline that Step 4.9 (storage) + Step 4.10 (compute) established now extends to the **pattern recognition layer** — the candlestick-detection routines that sit upstream of strategy detect methods.

Every entry point into the pattern recognition subsystem gains REQUIRED `assetClass: AssetClass` at the TypeScript signature:

- The top-level fan-out function (`scanPatterns(candles, symbol, assetClass)` in DawnTrader's case).
- Every internal detect function (`detectPinbar` / `detectEngulfing` / etc.) gains the parameter, threaded through from the fan-out function.
- The pattern-to-trade-signal converter (`patternToTradeSignal(pattern, currentPrice, atr, assetClass)`).
- Any class-method wrapper around these (the singleton `PatternRecognizerService`).
- The context-aware strategy picker (`selectContextAwareStrategy(regime, pattern, hash, assetClass)`).

**Body branching is NOT introduced by the plumbing batch.** All hardcoded thresholds inside the detect functions (PINBAR wick ratio, INSIDE_BAR tolerance, MORNING_STAR body/range, ABCD Fib bounds, ATR multipliers) stay byte-identical for the original asset class. Per-class numeric tuning is a **Layer-3 batch** that lands once the new asset class has shadow-mode evidence — typically 4–12 weeks of cycle data showing where the original-class threshold is or isn't fit-for-purpose. PATTERN-DETECT plumbs the parameter through; the per-class branching decision is evidence-gated.

**F-1 invariance lock-down:** the pattern *taxonomy* map (`PATTERN_TO_CANONICAL` / `normalizePatternToCanonical`) and the canonical pattern types enum (`CANONICAL_PATTERN_TYPES`) are **class-invariant by construction** — a PINBAR is a PINBAR regardless of asset class. These surfaces MUST NOT gain `assetClass` parameters. A dedicated F-1 invariance regression test (e.g. `b79-0n-pattern-detect-f1-invariance.test.ts`) locks the exact-shape assertion so a future drift attempt fails CI.

**Where this pattern came from**

B79.0n.PATTERN-DETECT worked example (deploy `c0479b2`, 2026-05-24). See `Claude Comms and Packages/Batch Completion/B79_0n_PATTERN_DETECT_COMPLETION_REPORT.md` §1 + §7 for the full set of onboarding learnings; see `SYSTEM_IMPACT_MAP.md` "Recent Additions (B79.0n.PATTERN-DETECT)" section for component-level deltas; see `SYSTEM_MANUAL.md` §4 (Pattern Strategies) for the post-batch signature spec.

---

### Step 4.12 — Pattern-pool gates naming convergence (B79.0n.PATTERN-DETECT canonical pattern, 2026-05-24)

**Standing rule:** every per-class `module_constants` row uses the SAME `constant_name` across asset classes; the resolver-key's `asset_class` field is the per-class differentiator. Different short-names for the same semantic lever across asset classes is a real bug, not a convention choice.

**Recognising the bug:** if you see rows like `module_constants.pattern_pool_gates.crypto_spot.pattern_final_score_min` AND `module_constants.pattern_pool_gates.xstock_spot.final_score_floor` (same semantic value, different name), that's per-class scoping that drifted onto the `constant_name` column when it should have stayed on the `asset_class` column. F-2 lever drift. Fix in a forward-converge migration:

1. Run an idempotent UPDATE that renames the divergent constant_name to match the canonical name from the original asset class.
2. WHERE clause is fully-scoped (module_name + exchange + asset_class + strategy + regime + constant_name = legacy_name). UPDATE 0 rows is the no-op shape when re-run.
3. ON CONFLICT DO NOTHING (or equivalent) on any subsequent INSERT of new sibling rows.
4. Update the consumer file (`<class>/pattern-pool-filters.ts` or equivalent) to use the converged name in its `getCachedNumberRequired(...)` calls.
5. Pre-batch grep BEFORE the rename migration: confirm zero current production consumers read via the legacy name as a string literal (catches DB-readers; the schema layer's getter file is already going to be updated as part of the rewrite).
6. Test: dedicated test file mocks the resolver and asserts the getter calls the correct key string.

**Recognising the design pressure:** the bug class arises when an asset class is onboarded asymmetrically. xStock's pattern-pool gates were seeded in May 2026 (B79_inherit_crypto era) with abbreviated short-names, while crypto's already-existing rows used a `pattern_*` prefix convention. The asymmetry persisted because no consumer read the xStock rows from the DB — they were forward-loaded scaffolding. The grep-before-rename step is what made the convergence safe to ship.

**Where this pattern came from**

B79.0n.PATTERN-DETECT worked example. Migration `2026-05-24b-b79-0n-pattern-detect-naming-converge.sql`; pre-audit §-0 grep cross-check that confirmed zero current production consumers; completion report §2 for the H/USD throw narrative + the Step 9 iteration that addressed it.

---

### Step 4.13 — Capture-and-reuse asset-class resolution at function/loop entry (B79.0n.PATTERN-DETECT canonical pattern, 2026-05-24)

**Standing rule:** when a function or loop iteration needs the asset class at multiple downstream consumers, resolve it ONCE at the function/loop entry, store in a local variable (e.g. `_assetClass`), and reuse across every downstream call. Do NOT re-call the resolver at each consumer site.

```ts
async function generateSignal(symbol: string, ...) {
  // Capture once at entry. Use safeResolveAssetClass — null → skip.
  const _assetClass = safeResolveAssetClass(symbol, 'kraken');
  if (_assetClass === null) {
    return null;  // graceful skip; no throw
  }
  // Now reuse _assetClass at every downstream call:
  const mceContext = mce.computeContext(symbol, ohlc, ..., _assetClass);
  const patterns = scanPatterns(candles, symbol, _assetClass);
  const selection = selectContextAwareStrategy(regime, pattern, hash, _assetClass);
  // ... etc
}
```

**Why this matters:**

1. **Resolver throws on unregistered symbols.** The original `resolveAssetClass(symbol, exchange)` throws when the symbol doesn't match any registered pattern. Multiple call sites in the same function body multiply the throw exposure — each new resolver call is a new fail-hard point for unregistered symbols. Use `safeResolveAssetClass` (returns null + logs WARN) at the capture site, and the caller decides skip vs default.
2. **Collision-symbol WARN amplification.** When `resolveAssetClass` succeeds with a known-collision symbol (a ticker that exists in two asset classes' raw namespaces), it logs a per-call WARN. N call sites = N WARNs per function invocation. Capture-and-reuse deduplicates the WARN to 1 per function-entry.
3. **Forward-loading.** When a future Layer-3 batch wants to wire per-class branching, the existing capture-and-reuse local variable is the single point to inject the branch — no need to refactor multiple consumer sites.

**Recognising the bug:** if you find a function body with 3+ identical `resolveAssetClass(symbol, exchange)` calls, that's the smell. Refactor to capture-and-reuse before adding any new call site.

**Where this pattern came from**

B79.0n.PATTERN-DETECT Step 9 iteration (commit `c0479b2`, 2026-05-24). Langston Step 8 second-pass flagged a pre-existing H/USD fail-hard throw at the original `vts-runner.ts:913` MCE call; investigation showed PATTERN-DETECT's 4 new `resolveAssetClass` call sites would have throw-amplified on the same symbols if the pre-existing throw hadn't shadowed them. The capture-and-reuse refactor consolidated 6 throwing sites (2 pre-existing + 4 new) to 2 capture calls and eliminated H/USD-style throws at all six. The remaining ~10 pre-existing throwing `resolveAssetClass` sites elsewhere in vts-runner.ts were out of scope and filed as RUNNING_ISSUES #139 (Phase 19 cleanup batch).

---

### Section D.1 — Concrete code-extension templates (Phase 24 reference)

Reference only — actual implementation is per-asset-class. Use xstock_spot's code as the worked example for each pattern.

**Extending `resolveAssetClass` for a new class:**
```ts
// shared/asset-classes.ts
// Branch order matters: exchange-first → display-form → collision-gate → membership → patterns
if (exchange === '<new-exchange-tag>') return ASSET_CLASSES.<NEW_CLASS>;
if (<NEW_CLASS>_DISPLAY.test(symbol)) return ASSET_CLASSES.<NEW_CLASS>;
if (<NEW_CLASS>_<EXISTING>_COLLISIONS.has(symbol)) {
  console.warn(`[<batch>][COLLISION_RESOLVE] ...`);
  return ASSET_CLASSES.<EXISTING>;
}
if (<NEW_CLASS>_SYMBOLS.has(symbol)) return ASSET_CLASSES.<NEW_CLASS>;
// Fall through to existing class patterns
```

**Registering a strategy for a new class** (when applicable — this is strategy-onboarding, not asset-class-onboarding):
- See `server/strategies/orb.ts` (B79.0d) as the template. 6 surfaces touched: (1) detect logic in `server/strategies/<name>.ts`, (2) import + 'name' in `StrategySignal.strategy` enum + thin wrapper in `server/services/strategy-engine.ts`, (3) dispatch block in `server/services/signal-orchestrator.ts` (gated on `activeStrategies.has + assetClass match`), (4) `CANONICAL_REGIME_STRATEGY_MAP` regime entries, (5) `STRATEGY_DISPLAY_NAMES` map, (6) module_constants seed SQL with `strategy.<name>` thresholds + `strategy_gates.*.<class>.<name>.enabled`.

**Ticker-collision discovery template** — see Section L "Step 1 — discover the collision set" pseudocode block.

**Per-class config seed migration template** — see `drizzle/migrations/2026-05-03-b69-asset-class.sql` for the column-add-then-default-set pattern + B79's `module_constants` xstock_spot seeds via insert-with-asset-class-scope.

**Persistence-at-trade-open** — already in place via `vts_open_trades` table + `vts-trade-persistence.ts` service (B79.0g). Future asset classes inherit automatically — `assetClass` column is class-agnostic; INSERT/DELETE/REHYDRATE paths work for any value. No new code needed per class for persistence.

**Scope:** asset-class onboarding, not exchange onboarding. Exchange differences (API, symbol normalization, fee schedule) are mostly mechanical. Asset-class differences (regime classification, strategy applicability, friction model, market hours, telemetry partitioning) ripple deep into the system. Exchange-onboarding is a separate, simpler doc — flagged here as future work.

---

## Plain-language front-matter (per Langston rev 3 §G)

For each asset class, lead with non-jargon: **what is this asset class, what's special about it, and why does DawnTrader treat it differently from the asset classes we already support?**

This section answers Kyle's stated need: "explain it without code." Every Section H worked example begins with this front-matter block, then drills into the technical decisions.

---

## Section A.0 — Asset Class Definition + Operational Profile

For every new asset class, populate this table BEFORE anything else. The table sets the operational facts that downstream architectural decisions key off.

| Field | Definition |
|---|---|
| Trading hours | 24/7? 24/5? Session-bound (RTH only)? Weekend gap? Pre/post-market? |
| Settlement | Centralized exchange book? On-chain? Custodial broker? T+0 / T+1 / T+2? |
| Geography / regulatory | Restricted jurisdictions? KYC requirements? Sanctioned-country considerations? |
| Fees (maker / taker) | Volume tier brackets? Stablecoin discounts? Payment-in-kind options? |
| Custody model | Self-custody available? Exchange-custody only? On-chain wallet required? |
| Exchange WS endpoint | Path + protocol version + heartbeat cadence + reconnect semantics |
| Exchange REST endpoint | Path + auth model + rate limits |
| Symbol form on each endpoint | Canonical form? Display form? WS feed form? Are these all the same? |
| Universe size + dynamism | Static? Growing? Shrinking? Frequent listings/delistings? |
| Tick size / lot size / fractional | Decimal precision in price + quantity. Minimum order size. |

### Section A.0 — xstock_spot worked example (B79)

| Field | xstock_spot value |
|---|---|
| Trading hours | 24/5. Closed Sat-Sun + US market holidays. |
| Settlement | Solana on-chain (1:1 backed equity tokens, Backed Finance). T+0 spot trade. |
| Geography / regulatory | Available on Kraken Pro non-US. UAE-resident user → permitted. |
| Fees | Same as Kraken Spot fee table. Taker 0.26%, Maker 0.16% at base tier. |
| Custody model | Kraken-custody on-platform. On-chain Solana wallet required for withdrawal (Phase 19 active-trading concern). |
| Exchange WS endpoint | `wss://ws-equities.kraken.com` (separate from `wss://ws.kraken.com/v2`) |
| Exchange REST endpoint | Equity Spot REST returns NO xStocks tickers; data via WS only or via the B74 archiver's per-pair candle endpoint. |
| Symbol form | Canonical = `<TICKER>/USD` (e.g. `AAPL/USD`). WS feed = same. Display = `<TICKER>x/USD` (e.g. `AAPLx/USD`). resolveAssetClass dispatches via XSTOCK_SPOT_SYMBOLS allow-list. |
| Universe size | 275 symbols today; growing toward 500 by EOY. Static config in `server/config/xstocks-universe.json`; manual update + commit. |
| Tick / lot / fractional | $1 minimum (fractional). Tick size verified via WS depth feed (pre-audit). |

---

## Section A — Discovery + Inventory

Use Section A.0 + this checklist to confirm the asset class is operationally well-understood before architecture decisions.

- [ ] Operational facts captured (Section A.0)
- [ ] Pair universe source identified
- [ ] Universe-refresh cadence decided
- [ ] Ticker / OHLC source(s) identified
- [ ] Live-pricing infrastructure path decided (extend existing vs build dedicated)
- [ ] Per-pair characteristics inventory completed (compare to BATCH_79_SCOPE.md §4)
- [ ] Asset-specific characteristics inventoried (sector, fundamentals, IV, etc.)

### Section A — xstock_spot worked example

- Pair universe: `xstocks-universe.json` static config; manual PR adds new symbols.
- Ticker: WS-only (`ws-equities.kraken.com`); 24h volume aggregated from `equity_spot_ohlc_1m` table populated by B74 archiver.
- Live-pricing: B79 uses 1m archive lookup (no real-time WS subscriber). Real-time WS adapter deferred to **B79.5** (Phase 19 active-trading prerequisite).
- Asset-specific characteristics:
  - **Sector classification** — required for Stage 12.5 portfolio-cluster prevention. Source: `yfinance.Ticker(symbol).info['sector']`. Refresh: annual cron. Stored as `sector` field in `xstocks-universe.json`.
  - Earnings calendar — DEFERRED to B79.x.
  - Market-cap classification, P/E, IV, analyst ratings — DEFERRED.

---

## Section B — Architecture Decisions

For every new asset class, decide:

| Decision | Options | Decision criteria |
|---|---|---|
| Scanner | Shared FX5 vs Dedicated | Telemetry isolation requirement. If signal distributions are materially different (equity vs crypto microstructure), dedicated. |
| Family filter path | Shared vs Separate | Family taxonomy (TFS/RBS/IE/HVU/ST) is regime-based, not asset-class-based; usually share. Per-family IMF thresholds asset-class-scoped. |
| RTB pool | Shared vs Separate | Day 1 share with biased ranking; B81's `expectedNetReturnR` primitive provides cross-asset parity. |
| Live-pricing | Extend existing vs Dedicated adapter | If endpoint differs (different WS host), dedicated adapter. |
| Telemetry isolation | By instance vs By assetClass param | The B79 fix establishes assetClass param plumbing as the cross-cutting standard. |
| Pattern pool | Shared vs Separate vs Disabled | Default: separate per asset class with asset-class-specific guardrails. |
| Quant family paths | Shared vs Separate per asset class | rev 7 §-2.5 SSOT: separate. Family-path keys asset-class-prefixed. |

### Section B — xstock_spot decisions (rev 7 consensus)

- Scanner: **DEDICATED** xstock scanner. (rev 5 §C: telemetry isolation + market-hours-aware loop + independent benchmarks.)
- Family filter path: **SHARED** taxonomy (TFS/RBS/IE/HVU/ST applies to equities), but per-family IMF thresholds asset-class-scoped per rev 7 §-2.5.
- RTB pool: **SHARED Day 1**, biased ranking acknowledged; cross-asset parity via B81 `expectedNetReturnR`.
- Live-pricing: **DEFERRED to B79.5**. B79 uses 1m archive lookup.
- Telemetry isolation: **assetClass param** at every boundary, default `'crypto_spot'` (backward-compatible). PairFailureTracker partitioned by-instance via dedicated AdaptiveScanManager.
- Pattern pool: **SEPARATE xstock_spot pattern pool**. 3 file-based strategies enabled Day 1: `inside_bar_reversal`, `morning_star`, `pivot_shift`.
- Quant family paths: **SEPARATE per asset class** with `xstock_spot.tfs` / `xstock_spot.rbs` / etc. SSOT keys.

---

## Section C — Schema + Configuration Surface

Every new asset class touches these schema concerns:

- `module_constants` — verify scope dimension supports asset_class scoping.
- `screener_filters` — has asset_class column? If yes, insert row. If no, schema migration first.
- `paper_sim_trades` — asset_class column present?
- `paper_sim_open_positions` — asset_class column present?
- `signal_eval_archive` — asset_class column present?
- `regime_factor_alternates` — asset_class column present?
- `tunable_status` column — does the row tag values as `pending_layer_3` for unknown thresholds?

### Section C — xstock_spot worked example

- screener_filters: B79 schema migration adds `asset_class` (text NOT NULL DEFAULT 'crypto_spot') + `tunable_status` (text DEFAULT 'active') columns. Backfill all existing rows to `asset_class='crypto_spot'`. Insert xstock_spot row with NO max_price cap (per Kyle).
- module_constants: scope-based lookup verified (B78 work). `xstock_spot.*` keys added per family-path SSOT discipline (rev 7 §-2.5).
- paper_sim_trades / signal_eval_archive / regime_factor_alternates / paper_sim_open_positions: B70+ era expected to have asset_class. PIA Step §2 audits + adds if missing.

---

## Section D — Code Surface

For every new asset class, build:

- `server/asset_classes/<class>/regime-thresholds.ts` — branch-condition constants, leaf module
- `server/asset_classes/<class>/friction.ts` — fee/spread/slippage model
- `server/asset_classes/<class>/pattern-pool-filters.ts` — guardrails for pattern path
- `server/asset_classes/<class>/market-hours.ts` — ONLY if session-bound
- `server/asset_classes/<class>/index.ts` — re-exports public surface

And wire into:

- `calculatePairRegime` — asset-class dispatch in `market-regime.ts`
- `cost-model.ts` — asset-class friction lookup
- `market-scanner.ts` (if dedicated scanner; instantiate factory)
- `signal_quality_evaluator.ts` — asset-class gates (confidence_threshold, di/adx/momentum mins)
- `resolveAssetClass` (in `shared/asset-classes.ts`) — symbol-to-class dispatch
- `MULTI_FAMILY_ELIGIBILITY` (in `canonical-regime-strategy-map.ts`) — strategy-asset-class scoping
- Telemetry / ratio / aggregator boundaries — `assetClass` param plumbed
- TEC stop-evaluation — `if (!isMarketOpenForAssetClass) return SKIP`

---

## Section E — 18-Stage Walkthrough Checklist

For every new asset class, walk all 18 stages. At each, answer:

- What variables / thresholds / gates apply?
- Are they asset-class-scoped or shared?
- Where do values come from (DB rows, TS constants, derived)?
- Layer 1 (domain-knowledge baseline) value?
- Tagged `pending_layer_3` if no domain knowledge available?

The 18 stages (B79 scope §1) are: Connection / Discovery / Adaptive Batch / DBS / Global Filter / Pattern Pool (PARALLEL) / Family-IMF / Regime / MCE / Strategy Detect / SQE / Cost / Ranking / Portfolio Risk / Trade Entry / Lifecycle / Position Mgmt / Trade Close / Calibration.

A row-per-stage table per asset class lives in Section H worked examples.

---

## Section F — Layer 1 / Layer 2 / Layer 3 protocol

Three-layer calibration discipline per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §6.2:

| Layer | Source | Duration | Output |
|---|---|---|---|
| **Layer 1** | Domain-knowledge baseline. Engineer judgment + literature. | 1-2 hrs in scope. | TS constants + DB rows tagged `tunable_status='active'` if confident OR `'pending_layer_3'` if not. |
| **Layer 2** | Cross-asset shadow-classify sanity check. Compare to crypto baseline. | 2-3 hrs in scope. | Confirms or revises Layer 1 values. |
| **Layer 3** | Live shadow-mode VTS observation. | per-asset-class (see §F.X). | Tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. Promotes `pending_layer_3` to `active`. |

### Section F.0 — Two parallel ablation frameworks run during Layer 3 (locked Kyle directive 2026-05-08)

Every new asset class onboarding runs **two parallel ablation frameworks** during shadow-mode observation. Both deliver Layer 3 evidence; both must be wired before live-loop activation:

1. **Factor-calibration ablation (B67.0 framework).** Per-factor counterfactuals on each chain modulator (b67_1 macro modifier, b67_2 phase, b67_4 outcome feedback, b68_1 multi-TF, b68_2 volume regime, b68_3 pair correlation, b68_4 regime age, b68_5 Path B sustainability). Stored in `regime_factor_alternates` (asset_class-scoped per B69). Drives the confidence-modifier chain calibration decisions per asset class (post-composition floor, individual factor enable/disable, lift-vs-control evaluation).
2. **Exit-strategy ablation (B73 framework).** 12 variants (BE A-F + Trail G-J + Combined K-L) per closed trade. Stored in `exit_strategy_alternates` (asset_class-scoped). Drives the **per-asset-class TEC configuration decisions** — specifically: should `break_even_enabled`, `trailing_exit` engagement, `target_lock_r`, `moonbag_*` constants be ON or OFF for THIS asset class? Crypto's B73 ablation showed Variant K (BE-disabled) wins; equity microstructure may differ.

Both frameworks are extensible: B67.0 hook in factor-ablation-emitter is asset-class-agnostic; B73 hook in `vts-service.persistRealPriceTrade` is asset-class-agnostic. **What's required for each new asset class:** confirm both hooks emit when `assetClass === '<new_class>'` + extend the aggregator paths (drift-dashboard for B67.0, exit-strategy-ablation for B73) so each asset class has its own results panel.

**Replacement is not the answer — parallel observation is.** B79.4 extends B73 to xstock_spot alongside crypto's existing B73 (both run side by side, separate aggregator scope filters by asset_class). Same pattern for B80 + future asset classes.

### Section F.X — Observation Period Sizing (per-asset-class flexibility)

Standard for crypto_spot: 14 days for B67/B68 calibration windows + 2 weeks for B73 exit ablation. **Other asset classes may differ** — equities trade 24/5 (~80 hr/wk) vs crypto 24/7 (168 hr/wk), so equivalent sample volume takes longer wall-clock. Each new asset class declares its observation period sizing during scope-lock, populated as PIA evidence on sample-rate-per-day accumulates in the first 24-48h post-live-wire.

**Decision criteria for the observation period length per asset class:**
- Target sample count per regime per factor bucket: ≥150 (per Langston cc-inbox #856 calibration check threshold)
- Wall-clock minimum: enough days to span at least one full weekly cycle (captures Mon/Fri intraday-pattern variation)
- Wall-clock maximum: don't observe past the point where regime conditions have shifted enough that early data is no longer comparable to current behavior

xstock_spot's specific observation period sizing populates as a Section H.1 entry once Layer 1 sample-rate evidence is in.

### Exit observation metrics (per Langston rev 5, scope §-2 row 7)

For asset classes with different volatility profiles than crypto (B79: equities are LESS volatile), Layer 3 explicitly calibrates exit-side constants. 6 metrics:

1. Time-to-target by regime
2. MAE-before-profit
3. MFE-at-exit
4. ATR-vs-%-stop comparative performance
5. Partial-take impact on net P&L
6. Hold-time by regime

These feed into Stage 14a position-management trigger calibration (BE-stop arming, trailing-stop activation, partial-take fractions).

---

## Section G — Verification + Forward-Watch

For every new asset class onboarding, define:

- **Behavioral verify checklist** — run on staging post-deploy, before claiming Step 7+8 complete
- **No-touch fence SQL** — query that confirms existing asset classes' factor-emission cadence is unchanged. Pattern from B78:
  ```sql
  SELECT factor_name, COUNT(*) FROM regime_factor_alternates
  WHERE asset_class = 'crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
  GROUP BY factor_name;
  ```
  Acceptance: counts within ±10% of pre-deploy baseline.
- **24h forward-watch dashboard** — what metrics get checked at +24h post-go-live
- **7d forward-watch dashboard** — what metrics get checked at +7d
- **Strategy-gap monitoring discipline** (per Langston rev 5, scope §2.X.9) — explicit gap-watching criteria during shadow-mode. 5 concrete triggers:
  1. Fire-rate by regime <50% of crypto baseline
  2. ≥80% concentration in ≤2 strategies
  3. Win-rate clustering 40-50% (no edge)
  4. Identifiable temporal windows where no strategy fires
  5. Named pattern recurrence in unfilled signal opportunities

Each trigger has a documented next-action (typically: open a sub-batch to add the missing strategy).

---

## Section H — Worked Examples

### Section H.1 — xstock_spot (B79, Phase 24)

#### H.1 Plain-language front-matter

xStocks are tokenized 1:1 backed equities listed on Kraken's Pro venue at `wss://ws-equities.kraken.com`. Each xStock token (e.g. AAPLx) is fully collateralized by an actual share of the underlying NYSE/NASDAQ stock (AAPL) held by Backed Finance, a regulated Liechtenstein issuer. They settle on the Solana blockchain (T+0 atomic), trade fractionally with a $1 minimum, and operate on US market hours (24/5 — closed Sat/Sun + US holidays + early-close days).

Why DawnTrader treats them as a separate asset class:

- **Hours.** Crypto is 24/7; equities are 24/5. The scanner must early-return on weekends; the trade lifecycle controller must freeze stops when the market is closed (a stop can't fire when there's no price action).
- **Volatility profile.** Crypto pairs run 2-8% ATR%; equities run 0.5-2%. Regime classifier thresholds halved as Layer 1 baseline.
- **Microstructure.** Crypto has flat 24/7 volume; equities have a U-shape (open-bell + close-auction peaks, lunch lull). Volume-normalized indicators behave differently.
- **Macro inputs.** BTC dominance and crypto funding rates are irrelevant; equities respond to VIX, S&P trend, sector rotation. Macro modifier defaults to 1.0 in B79; equity-equivalent macro inputs deferred to **B79.3**.
- **Failure modes.** Crypto rarely halts; equities have LULD halts, circuit breakers, dividends, splits, scheduled earnings windows. New taxonomy table per scope §1.X.
- **Sector correlation.** Equities cluster by sector (5 tech stocks all move together) much harder than crypto's symbol-similarity grouping. Portfolio-cluster prevention needs sector-aware logic in **B79.6**.
- **Tokenization vs underlying.** AAPLx may or may not trade like AAPL. The Q-D pre-implementation probe (yfinance comparison, 4-window correlation, 3-tier decision tree) determines downstream design intuitions before coefficient calibration is trusted.

This worked example walks the full Section A through G for xstock_spot.

#### H.1.A.0 Operational Profile

(See Section A.0 above.)

#### H.1.B Architecture Decisions

(See Section B above.)

#### H.1.C Schema

- `screener_filters` migration: `asset_class` + `tunable_status` columns; xstock_spot row with no max_price cap.
- xstock_spot module_constants seed rows:
  - `xstock_spot.regime.*` per regime-thresholds.ts (asset-class-prefixed keys per rev 7 §-2.5)
  - `xstock_spot.sqe.confidence_threshold = 70` (vs crypto 60; conservative Day 1 Layer 1)
  - `xstock_spot.sqe.di_min_quant = 18`, `adx_min = 18`, `momentum_min = 0.002`, `di_min_pattern = 10`
  - `xstock_spot.macro_modifier = 1.0` (placeholder pending B79.3)
  - `xstock_spot.orb_enabled = false` (Q-D-gated)

#### H.1.D Code Surface

Files added / modified — see BATCH_79 commit hashes (linked in BATCH_CATALOG entry).

#### H.1.E 18-Stage Walkthrough

Per scope §1 / scope §2.X. Cross-references stages 0-16 + cross-cutting failure mode taxonomy.

#### H.1.F Layer 1 / 2 / 3 Status

- Layer 1: complete in B79 (regime thresholds, SQE thresholds, friction values).
- Layer 2: cross-asset shadow-classify spot-check (xstock pairs into existing classifier with shared math; verify branch routing makes sense).
- Layer 3: live shadow-mode VTS observation 48-72h+. Drives sub-batches B79.1+ (coefficient tuning, equity-specific strategy additions, exit-side calibration).

#### H.1.G Forward-Watch

- 24h post-deploy: confirm shadow-mode VTS emission for xstock_spot pairs, factor-ablation counts populating in `regime_factor_alternates`, no-touch fence SQL on crypto_spot still green.
- 7d post-deploy: strategy-gap monitoring (5 triggers from Section G); resource-watch metrics from scope §11.5.

#### H.1.x Standing rules added by Phase 24

Pared to genuine standing rules — things that MUST be done every time a new asset class is onboarded. Trial-and-error history lives in completion reports (`BATCH_79_*_COMPLETION_REPORT.md`); only resolved patterns are codified here.

**1. Ticker-collision check at scope time (NEW SECTION L below — most important Phase 24 learning).** Mandatory pre-implementation gate when the new asset class shares an exchange with an existing class.

**2. Per-class behavioral config with HARD-FAIL boot (extends §I.0 #3).** Trading-policy DB rows must be explicit per asset class. The Phase 24 enforcement mechanism: `primeXConfig()` boot-time warmup throws if any registered class lacks an explicit row. Wildcard `*` row is acceptable ONLY when truly identical across all classes; the moment any class diverges, the wildcard is replaced with explicit per-class rows. No silent fallbacks. Applies to ANY behavioral knob (TEC config, regime thresholds, SQE thresholds, friction, confidence floors).

**3. Per-symbol predicates when class is non-monolithic (extends Section A.0).** Add a row to the operational-profile table: "Are all symbols in this class operationally identical, or does the exchange treat some differently (24/7 names within a 24/5 class, halt-able names, pre/post-market windows)?" If non-monolithic: every market-state predicate (`isMarketOpen`, freshness gate, TEC stop-freeze) requires symbol as first arg from Day 1. Optional-with-silent-fallback signatures create a silent-bug class.

**4. Telemetry partitioning when signal distributions differ (extends §B).** If null-rates, fire-rates, or filter-pass-rates are NOT equivalent to existing classes, build a separate-instance triad (Telemetry + RatioManager + FailureTracker + ScanManager) via `getAssetClassInstances(class)` factory pattern. Crypto path returns existing globals (back-compat); new class lazy-instantiates fresh triad. Do NOT param-plumb `assetClass` through every callsite (silent-corruption risk).

Everything else from B79.0a–0g (state-vs-config rehydrate boundary, N3+N4 cleanup, scaffold-vs-live separation, persistence-at-trade-open architecture, strategy 6-step pattern, namespace-reservation, comms-infra protocols) is either (a) infrastructure now baked into the system that future asset classes inherit automatically, (b) general engineering hygiene not asset-class-specific, or (c) process/tooling unrelated to onboarding. Trial-and-error history of HOW we got there lives in the per-batch completion reports.

### Section H.2 — crypto_perp (B80, Phase 25)

To be populated when B80 ships.

### Section H.3 — (future asset classes)

---

## Section I — Onboarding Decision Framework

If/then rules surfaced from xstock_spot worked example. Apply on every new asset class:

### Section I.0 — Universal rules (Kyle directives 2026-05-08, applied to ALL onboardings)

1. **NO PATCHES.** Every fix and feature must be a long-term, sustainable, stable, scalable solution. No duct tape. No "good enough for now." Surfaced bugs trigger root-cause investigation + design-then-implement, not patches. Cold-start warmup is acceptable (1-5 minute deterministic startup beats instant-on with stale-cache races). Every architecture decision discussed gets documented BEFORE implementation in the relevant governance doc the same session it's discussed. Verbal "we'll do that later" without paper-trail is rejected.
2. **Backpressure is never asset-class shedding.** Resource ceilings trigger vertical-scale (Hetzner / Supabase tier upgrade) or computational-distribution refactor — never drop-cycles or throttle-on-a-live-asset-class. Pre-deploy load test is a sizing decision-gate, not a squeeze-it-in gate.
3. **Per-asset-class configuration is the default for behavioral knobs.** Trading-policy decisions (BE enable, trailing exits, regime thresholds, confidence floors, friction values) MUST be DB-resolved with `asset_class` as a first-class scoping dimension. Wildcard `*` is acceptable as a starting placeholder ONLY when the value is genuinely identical across all classes; the moment any class needs a different value, the wildcard is replaced with explicit per-class rows. No silent fallbacks.
4. **Both ablation frameworks run during shadow-mode.** Factor-calibration ablation (B67.0) AND exit-strategy ablation (B73) — parallel, both required, each contributes Layer 3 evidence to per-asset-class trading-policy decisions. Replacement of an existing asset class's ablation is never the answer — parallel observation is.
5. **Per-asset-class observation period.** No universal "X days" rule — each new asset class declares its observation period during scope-lock based on sample-rate-per-day evidence. Minimum bound: ≥150 samples per regime per bucket. Wall-clock minimum: at least one full weekly cycle.
6. **Each new asset class gets its OWN dedicated observation UI tab** (Kyle directive 2026-05-08). Do NOT stack new ablation panels under existing tabs — those tabs grow unwieldy as multiple asset classes accumulate. Crypto_spot's Drift Dashboard tab stays as-is for crypto observation. xstock_spot observation panels live on a new dedicated tab (B79.4 deliverable). crypto_perp observation panels live on a new dedicated tab when B80 ships. Future asset classes follow the same pattern. This applies to BOTH ablation panels (factor-calibration AND exit-strategy) — they live side-by-side on the same per-asset-class tab.
7. **Update RUNNING_ISSUES + governance docs SAME SESSION as discussion** (Kyle directive 2026-05-08). Verbal commitments without paper-trail are rejected. Every architectural decision and every scope addition gets documented BEFORE implementation in the relevant governance doc the same session it's discussed. The project is too large + runs over too many phases for verbal commitments to survive.
8. **Comms with Langston follow file-first protocol for any large content** (CLAUDE.md §6.5.0; Kyle directive 2026-05-08). Design asks, scope drafts, multi-question reviews go in `Claude Comms and Packages/Langston Design Asks/<batch>_<topic>_<rev>.md`; Telegram + watchdog prompt is the SHORT (under 1KB) pointer to the file. Never shorten content to fit a prompt — putting it on disk is the proper solution.


| If | Then |
|---|---|
| Session-bound (not 24/7) | Build `market-hours.ts` + holiday calendar; mandatory scanner early-return + TEC stop-freeze gates. |
| Macro factors non-trivial | Ship macro_modifier=1.0 default; defer equity-equivalent macro inputs to a sub-batch with explicit Layer 3 evidence trigger. |
| Unique microstructure (vs existing classes) | Strategy-gap analysis required pre-ship. Document gap-watching triggers. |
| Session timing introduces systematic gaps (overnight, weekend) | BE-stop trigger reviewed not inherited. Trailing-stop activation thresholds re-derived in Layer 3. |
| Sector / cluster correlation > intra-class crypto correlation | Portfolio-cluster sector-aware. Sector classification source identified + scripted. |
| New failure modes (halts, circuit breakers, dividends, earnings) | Failure-mode taxonomy table populated before ship. Detection + handling for the most-likely modes implemented or deferred-with-tracking-issue. |
| Settlement model differs (on-chain, custody, T+1) | Phase 19 active-trading prerequisites flagged. Friction model accounts for any settlement-side cost. |
| Universe is dynamic | Refresh protocol decided + automated where possible. Static config for stable, automated for rapid-change. |
| Real-time pricing on a different WS endpoint | Live-pricing adapter onboarded as a separate sub-batch. B79 ships archive-lookup-only as Day 1 path. |

---

## Section J — Reusability for B80 + future

When B80 (crypto_perp) implementer starts:

1. Open this doc.
2. **Run Section L (ticker-collision check) FIRST** — at scope time, before any architecture decisions. Live `/AssetPairs` intersection of crypto_perp universe against crypto_spot AND xstock_spot universes. Document collision set with provenance.
3. Walk Section A through G for crypto_perp. At Section A.0, answer the monolithic-vs-per-symbol question (H.1.x rule 3) — perp may need per-symbol predicates if the exchange treats funding-window timing as per-pair.
4. Confirm telemetry partitioning (H.1.x rule 4) by comparing crypto_perp signal/null distributions against crypto_spot baseline. If non-equivalent, build the separate-instance triad.
5. Confirm per-class behavioral config (H.1.x rule 2) — every TEC / regime / SQE / friction knob gets an explicit `crypto_perp` row. HARD-FAIL boot.
6. Identify perp-specific deltas:
   - Funding rate (per-pair signal, NEW input to macro modifier composition)
   - Leverage + liquidation
   - Perpetual settlement
   - Funding-time clustering (8-hour funding windows)
7. Update Section H.2 with crypto_perp as worked example. Add Section H.2.x post-mortem at T+7d post-go-live with **only the genuinely new standing rules** — keep this doc lean.

**Compounding value:** every new asset class strengthens the workflow. By the time we add FX (Phase later), the doc is battle-tested against equity, perp, and existing crypto-spot baselines.

---

## Section L — Ticker-collision check (NEW, Phase 24 standing rule)

**This is a mandatory pre-implementation gate** when the new asset class shares an exchange with an existing class. Phase 24 surfaced this the hard way — see `BATCH_79_0f_COMPLETION_REPORT.md` for the historical SUI/USD bug.

### The problem in one sentence

A single base-symbol exists in BOTH the new asset class's universe AND an existing asset class's universe on the same exchange, producing identical canonical form (e.g. `SUI/USD` is both Sun Communities equity and Sui Network crypto on Kraken). Without an explicit gate, downstream consumers that re-resolve from canonical form silently misclassify every signal on the collision tickers.

### What you must do (every onboarding, no exceptions)

**Step 1 — discover the collision set at scope time.** Live API intersection:

```python
# Pseudocode — adapt to actual exchange API
existing_class_bases = {<every base symbol the existing class trades on this exchange>}
new_class_bases     = {<every base symbol the new class trades on this exchange>}
collisions = sorted(existing_class_bases & new_class_bases)
```

The output is the collision set. Document it in `shared/asset-classes.ts` as a `<NEW_CLASS>_<EXISTING_CLASS>_COLLISIONS` constant **with a provenance comment block** citing:
- Exchange API endpoint queried (e.g. `https://api.kraken.com/0/public/AssetPairs`)
- Date the query was run
- Re-audit cadence (default: quarterly)

**Step 2 — gate the resolver.** In `resolveAssetClass(symbol, exchange)`, the new asset class's membership-set fast-path is GATED on collision-set non-membership. Tickers in the collision set fall through to the existing class on the regular exchange path; the new class is reached only via (a) a different `exchange` value (e.g. `kraken-equities` vs `kraken`) or (b) an explicit display form that disambiguates (e.g. the lowercase `x` suffix in `SUIx/USD`).

**Step 3 — emit a WARN log on collision-without-disambiguation.** When a collision ticker hits the regular exchange path without a disambiguating form, log `[<batch>][COLLISION_RESOLVE]` once per occurrence so any future drift in the data-ingestion invariant (e.g. an upstream caller losing the `x` suffix in transit) is observable in production.

**Step 4 — write regression-lock tests.** One test per collision ticker pinning the resolved class. Tests must FAIL if a future commit accidentally drops the gate.

**Step 5 — backfill historical mis-tagged rows IF the collision-bug ever existed in production.** Audit script (read-only, SELECT-only) over every table with an `asset_class` column. Backfill UPDATE statements commented-out in the same script — manual uncomment after counts are reviewed. Per-table row counts paper-trailed in `CHANGES_AND_FIXES.md`.

### Why this gate is non-negotiable

The data-ingestion path (which WS endpoint or REST domain the data arrived from) IS the authoritative signal — `kraken-equities` routes to xstock_spot, `kraken` to crypto_spot. After a symbol is canonicalized post-ingestion, it can be ambiguous between asset classes. Downstream consumers MUST read `asset_class` from the persisted row; never re-resolve from canonical form. The collision gate ensures that even if a downstream consumer DOES re-resolve, the resolution is correct.

### Standing rule

Quarterly re-audit of the collision set. Exchanges add tokens regularly; new collisions emerge. The provenance comment on the constant carries the last-verified date — re-run the intersection query when that date is older than 90 days.

---

## Section K — Future: Exchange-onboarding workflow

Out of scope for this doc. Exchange-onboarding (when adding Binance, Coinbase, Bybit, etc.) is mostly mechanical: API auth, symbol normalization, fee schedule, WS protocol differences. To be authored as a separate doc when the second exchange is added.

---

## Section M — Stand up the dedicated observation tab

> **Added 2026-05-10 post-B79.0i.b.** The xstock_spot tab in `Machine Learning > xStocks` is the worked example. B80 (crypto_perp) implementer follows this recipe to stand up the equivalent for perp.

### Why this section exists

Phase 24 standing rule #10: **every new asset class gets a dedicated observation UI tab.** B79.0i landed three iterations under Kyle pushbacks before reaching the right design — this section captures the durable recipe so B80 doesn't repeat the iteration cost. The recipe rests on two architectural patterns established in B79.0i.b (now Phase 24 standing rules #6 + #7 in SYSTEM_MANUAL appendix):
- **#6** Cross-asset-class UI component reuse via export+endpointBase prop
- **#7** Shared aggregator parameterization via optional asset_class

### Step 1 — Parameterize the shared backend aggregators

For each shared aggregator function the new asset class needs (e.g., `computeExitStrategyAblation`, `computeFactorCalibration`, `computeAblationComparison`), add an optional `assetClass` parameter with a default value preserving the legacy behavior.

```typescript
// BEFORE
export async function computeFoo(window: Window): Promise<FooResponse> {
  // ... SQL with hardcoded "AND asset_class = 'crypto_spot'" ...
}

// AFTER
export async function computeFoo(
  window: Window,
  assetClass: string = 'crypto_spot', // OR null if the legacy default was no filter
): Promise<FooResponse> {
  // ... SQL with parameterized "AND asset_class = ${assetClass}" (or conditional clause when default is null) ...
}
```

**Crypto regression invariant:** verify post-deploy that the existing `/api/analytics/<endpoint>` returns byte-identical response when called without changes. Run a curl-diff on the response shape if the aggregator returns mixed-asset rows; check row count unchanged if filtered.

### Step 2 — Export the rich UI sections (refined BATCH_82 — explicit assetClass prop)

The xStocks tab proved 3 components are worth reusing:
- `FilterDiagnosticsPanel` from `machine-learning.tsx` (the full Filter Diagnostics tab content)
- `ExitStrategyAblationSection` from `analytics.tsx` (B73 exit ablation tables)
- `FactorCalibrationSection` from `analytics.tsx` (B67 calibration tables)

Convert each from internal-only to `export function` with **both an `endpointBase` prop AND an explicit `assetClass: AssetClass` REQUIRED prop** (BATCH_82 refinement, per Langston design review Q3 2026-05-14):

```typescript
// BEFORE (pre-B82 — endpointBase only, asset class implicit in URL)
export function FactorCalibrationSection({
  endpointBase = '/api/analytics/factor-calibration',
}: { endpointBase?: string } = {}) {
  // ... no way to get the human-readable asset-class label without URL-string-parsing ...
}

// AFTER (post-B82 — explicit assetClass prop, type-safe)
import { ASSET_CLASS_REGISTRY, type AssetClass } from "@shared/asset-classes";

export function FactorCalibrationSection({
  endpointBase = '/api/analytics/factor-calibration',
  assetClass,
}: { endpointBase?: string; assetClass: AssetClass }) {
  const displayName = ASSET_CLASS_REGISTRY[assetClass].displayName; // "xStock Spot", "Crypto Spot"
  // ... rendering can now reference displayName for empty-state copy, badges, etc. ...
}
```

**Why explicit prop, not URL-string-parsing:** the parent component already knows which asset class it's rendering (that's how it chose the endpointBase). Encoding that knowledge twice — once in the URL, once derived back from the URL — is brittle. URL conventions will rot as new asset classes come online; explicit type-safe prop scales linearly for N asset classes.

For shapes that don't have built-in endpoints, also export the response-data type so the asset-class tab can typecheck its endpoint.

### Step 3 — Build sibling endpoints under `/api/<asset_class>/`

For each shared aggregator the asset-class tab needs, add a sibling route handler that calls the parameterized aggregator with the asset class fixed:

```typescript
apiRouter.get('/<asset_class>/exit-strategy-ablation', authenticateToken, async (req, res) => {
  const { computeExitStrategyAblation } = await import('./services/exit-strategy-ablation-aggregator.js');
  const win = (req.query.window as string) || 'rolling_7d';
  const regimeFilter = (req.query.regime as string) || null;
  const data = await computeExitStrategyAblation(win, regimeFilter, '<asset_class>');
  res.json({ ok: true, data });
});

apiRouter.get('/<asset_class>/factor-calibration', authenticateToken, async (req, res) => {
  const { computeFactorCalibration } = await import('./services/drift-dashboard-aggregator.js');
  const win = (req.query.window as string) || 'rolling_7d';
  const data = await computeFactorCalibration(win, '<asset_class>');
  res.json({ ok: true, data });
});
```

For the FilterDiagnosticsPanel feed, build a NEW endpoint `/api/<asset_class>/filter-diagnostics` that returns the full `FilterDiagnosticsData` shape populated from the asset-class-specific scanner + `signal_eval_archive` aggregations + ticker_snap counts. Honest signaling: where the scanner doesn't yet emit funnel-rejection counters, those fields stay zero (don't fake them).

### Step 4 — Build the new tab component

`client/src/components/machine-learning/<asset_class>-tab.tsx`:

```typescript
import { FilterDiagnosticsPanel, type FilterDiagnosticsData } from "@/pages/machine-learning";
import { FactorCalibrationSection, ExitStrategyAblationSection } from "@/pages/analytics";

export function <AssetClass>Tab() {
  const { data: filterData, isLoading: filterLoading } = useQuery({
    queryKey: ['/api/<asset_class>/filter-diagnostics', { asset_class: '<asset_class>' }], // cache-key isolation
    queryFn: () => apiFetch('/api/<asset_class>/filter-diagnostics'),
    refetchInterval: 15000,
  });

  // ... freshness query, scanner query, etc. ...

  return (
    <div className="space-y-4" data-testid="<asset_class>-tab">
      <h2>...{asset_class}... — VTS Observation</h2> {/* NEVER "shadow-mode" — Kyle directive */}

      <ScannerCycleHeader data={filterData} />
      <FreshnessPanel data={freshnessData} />

      {/* REUSED FilterDiagnosticsPanel scoped via endpoint */}
      <FilterDiagnosticsPanel data={filterData} isLoading={filterLoading} />

      {/* REUSED ablation sections via endpointBase + explicit assetClass prop (BATCH_82) */}
      <ExitStrategyAblationSection endpointBase="/api/<asset_class>/exit-strategy-ablation" assetClass="<asset_class>" />
      <FactorCalibrationSection endpointBase="/api/<asset_class>/factor-calibration" assetClass="<asset_class>" />
    </div>
  );
}
```

**BATCH_82 note:** crypto-side callers in `analytics.tsx` Drift tab also pass `assetClass="crypto_spot"` explicitly. The prop is REQUIRED on both section components — TypeScript blocks the build if any caller omits it (closes the silent-URL-derive anti-pattern).

### Step 5 — Wire the tab into Machine Learning Tabs group

In `client/src/pages/machine-learning.tsx`, add the new TabsTrigger + TabsContent block. **Position LAST** in the tabs group:

```typescript
import { <AssetClass>Tab } from "@/components/machine-learning/<asset_class>-tab";

<TabsTrigger value="<asset_class>" className="flex items-center gap-2" data-testid="tab-<asset_class>">
  <SomeIcon className="w-4 h-4" />
  <Asset Class Display Name>
</TabsTrigger>

<TabsContent value="<asset_class>">
  <<AssetClass>Tab />
</TabsContent>
```

### Step 6 — Verify via Claude-in-Chrome G3 walkthrough

Mandatory per Kyle directive 2026-05-10:
1. Navigate to staging Machine Learning page
2. Click the new asset-class tab
3. Screenshot all 5+ sections
4. Browser DevTools Network tab — verify NO 4xx/5xx on asset-class-scoped XHR calls
5. Console — verify NO app errors (browser-extension noise OK)
6. Click back to existing Filter Diagnostics tab — verify visually identical to pre-deploy
7. Curl `/api/analytics/<shared-endpoint>` — verify response shape unchanged from pre-deploy

### Standing rules

- **Terminology: "VTS Observation", NEVER "shadow-mode".** Per Kyle directive 2026-05-10 evening: "stop referring to VTS and passive learning as shadow mode. That is not terminology we are using."
- **Honest signaling:** when an asset-class scanner is observability-only and not wired through orchestration yet, FilterDiagnosticsPanel funnel-rejection rows show zero. Do NOT fake counters. File the gap as a RUNNING_ISSUES entry pinning the future B<N>.x batch.
- **Crypto regression invariant:** every shared-aggregator parameterization must preserve byte-identical default behavior. Verify with curl-diff post-deploy.
- **Cache-key isolation:** every `useQuery` against a shared endpoint must include `{ asset_class: '<asset_class>' }` in its `queryKey` array.

### Caveats from B79.0i

- **Schema check before query writing.** B79.0i.b initially errored on `factor-calibration` trying to read flat `real_confidence`/`alt_confidence` columns that don't exist. Schema uses jsonb `real_decision`/`alternate_decision` columns with `->>'confidence'` extraction. Always run `psql \d <table>` on staging before writing aggregator SQL — don't assume column shape from naming convention. Rev2 sidesteps this by using the shared aggregator (already correct).
- **Empty-state messages matter.** The reused crypto components have built-in empty-state messages explaining what populates them. They're honest, useful, accurate even pre-data-accumulation. Don't replace them with custom lighter ones.

---

*End ASSET_CLASS_ONBOARDING_WORKFLOW.md.*
