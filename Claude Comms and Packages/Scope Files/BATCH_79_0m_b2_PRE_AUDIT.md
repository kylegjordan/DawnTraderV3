# BATCH 79.0m.b2 — Pre-Implementation Audit (rev2)

> **Status:** rev2 — Langston rev1 review applied (8 specific edits + precheck data added). Awaiting rev2 sign-off before code.
> **Author:** Claude Code
> **Created:** 2026-05-11 (rewritten post-B79.0m.b PM2 #221 ship; supersedes the earlier B79.0m.b2 pre-audit draft which referenced items now shipped)
> **rev2 changes (2026-05-11 evening):** see §-1 "Langston rev1 feedback applied" below — covers C-1 `min_history_days` semantics, EXPLAIN ANALYZE precheck, pattern-strategy module_constants audit, signal_eval_archive sourcePool storage path, ORB rollback trigger, new G12 gate, new `patternRejectByMinHistory` counter, scanPatterns ATR audit.
> **Scope ref:** `BATCH_79_0m_b2_SCOPE.md` (sibling file)
> **Langston review:** `Claude Comms and Packages/Langston Design Asks/B79_0m_b2_scope_review_rev1_reply.md`
> **Resolves toward:** Section A items in `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`

---

## §-1. Langston rev1 feedback applied + precheck data

### -1.1 — C-1: `min_history_days=21` bar-count semantics (CRITICAL, Langston's #1 concern)

**Problem.** Crypto's pattern row carries `min_history_days=21`. On crypto 24/7 = 30,240 1-min bars; on xstock RTH (~6.5h × ~21 trading days) ≈ 8,190 bars. If `pattern-filter.ts` interprets `min_history_days` as a bar-count parity check, every xstock pair gets rejected.

**Resolution: Option B (asset-class-explicit smaller threshold + bar-count gate in pattern-filter).** Reasoning:
- The `screener_filters.min_history_days` field is column-typed `integer DEFAULT 30` and other consumers (`global-filter.ts` for xstock) ignore it for the in-cycle gate (line 105-108 comment: "metadata field expressing 'we've been collecting OHLC for N days' — corpus-level invariant, not a per-pair-cycle bar count").
- Pattern-filter.ts follows the same convention: `min_history_days` is corpus-level metadata; the per-cycle bar-count gate uses a hard-coded minimum (60 bars) consistent with `global-filter.ts:109`.
- Xstock's `vts_pattern` row will be seeded with `min_history_days=21` (clones crypto, treated as metadata).

**Code shape:** `pattern-filter.ts` per-pair gate: `if (ohlc.length < 60) return {passed: false, reason: 'pattern_history_lt_60', ...}`. This matches `global-filter.ts:109` exactly.

**New counter:** `XstockEvalCycleCounters.patternRejectByMinHistory` (Langston edit #7). Will instantly surface if pattern-filter rejects all pairs on history.

### -1.2 — C-2: pattern strategy module_constants scope (calibration debt acknowledged)

**Precheck result:** `module_constants WHERE module_name IN ('strategy.morning_star', 'strategy.inside_bar_reversal', 'strategy.pivot_shift')` returns **26 rows, ALL `asset_class='*'`** (wildcard). Zero xstock_spot-scoped overrides.

Constants currently wildcard-only:
- `morning_star`: 7 rows incl. `min_pattern_strength=0.55`, `target_exit_atr_multiplier=2.5`, `volume_threshold_multiplier=1.2`, etc.
- `inside_bar_reversal`: 8 rows incl. `max_compression_ratio=0.85`, `target_exit_atr_multiplier=2.0`, `volume_threshold_multiplier=1.3`, etc.
- `pivot_shift`: 11 rows incl. `adx_slope_confidence_bonus_max=0.20`, `stop_loss_atr_multiplier=1.5`, `target_exit_atr_multiplier=3.0`, etc.

**Disposition:** Layer-1 starter ships with wildcard rows. xstock pattern signals will resolve via wildcard fallback (existing behavior). **Documented as calibration debt** — completion report calls it out under "known Layer-3 calibration targets." Acceptable for Layer-1 because (a) the constants are scale-free pattern-geometry parameters or ATR-multiplier-based (xstock's smaller ATR auto-shrinks stop/target distances proportionally; not a hard bug), (b) the same crypto-tuned values are what produced the existing pre-B79.0m.b2 fire counts in the archive (no observable distortion yet).

**Belt-and-suspenders unit test (Langston edit #5):** test that `getCachedNumbersForModule('strategy.morning_star', {assetClass: 'xstock_spot', ...})` returns the wildcard values explicitly (not silently undefined) — guards against future asset-class scoping regressions.

### -1.3 — C-3: `scanPatterns()` ATR usage

**Precheck result:** `pattern-recognizer.ts` line 553-554:
```ts
const stopDistance = atr > 0 ? atr * 1.5 : currentPrice * 0.01;
const targetDistance = atr > 0 ? atr * 2.5 : currentPrice * 0.02;
```
ATR is used for stop/target distance ONLY, not for pattern detection. Pattern shape geometry (3-bar Morning Star, Inside Bar compression, etc.) is scale-free. Fallback to 1%/2% of price when atr=0.

**Verdict:** Acceptable for Layer-1. ATR shrinks proportionally for equity microstructure (xstock ATR is smaller than crypto), so stop/target distances auto-scale. The 1.5×ATR / 2.5×ATR multipliers are crypto-tuned but applied to xstock-native ATR values, not crypto-native ones. Layer-3 may want different multipliers; documented as calibration target.

### -1.4 — §3 precondition: `signal_eval_archive.source_pool` column

**Precheck result:** `signal_eval_archive` has NO top-level `source_pool` column. Columns are: `id, captured_at, symbol, exchange, asset_class, mode, source, strategy, regime_label, reject_stage, final_score, confidence_modulated, features (jsonb), modulators (jsonb), gate_decision (jsonb)`.

**Source pool is stored inside `features` jsonb** — existing eval-cycle writes `features: {sourcePool: 'xstock_spot', ...}`.

**G7 SQL adjusted** (verification gate update — moved into §3 below): `WHERE asset_class='xstock_spot' AND features->>'sourcePool' = 'pattern' AND strategy IN ('morning_star','inside_bar_reversal','pivot_shift') AND reject_stage='admitted'`.

**No schema migration needed for source_pool** — jsonb path is correct.

### -1.5 — Q-L3: EXPLAIN ANALYZE precheck on `xstock_spot_ohlc_1m`

**Query:** `SELECT interval_begin, open, high, low, close, volume FROM xstock_spot_ohlc_1m WHERE symbol='AAPL/USD' AND interval_begin > NOW() - INTERVAL '7 days' ORDER BY interval_begin DESC LIMIT 100;`

**Plan summary:**
- **Subplans Removed: 1** (one partition pruned at planning time).
- All 13 partitions show `Index Scan using xstock_spot_ohlc_1m_<YYYY_MM>_symbol_interval_begin_idx` — propagated to all child partitions.
- 12 partitions return 0 rows in <10μs each via index probe.
- 1 partition (current month) returns 100 rows in 0.281ms.
- **Execution Time: 1.035 ms total.**
- Planning Time: 3.859 ms (could be reduced with cache warmup but irrelevant for async path).

**Verdict:** Per-trade B73 replay xstock query is sub-millisecond at index-coverage parity with crypto. No partition pruning concerns. Async fire-and-forget path is safe at projected 50-100 closes/day.

### -1.6 — B73 replay async error surfacing (Langston edit, part of Q-L3)

`fetchOhlcForReplay` for xstock will log `[B73-REPLAY][XSTOCK] err=<message>` on any exception path, with a process-scoped error counter `b73_xstock_replay_errors` incremented per failure. Surfaced in PM2 logs. The counter is OBSERVATIONAL ONLY (no auto-disable); a separate monitoring batch can add alerting.

### -1.7 — ORB rollback trigger (Langston edit #8, rev2 refinement with canonical reject_stage)

**Family-eligibility gate canonical sites** (verified via grep `family_filter_mismatch` 2026-05-11):
- Crypto: `server/services/vts-runner.ts:3174-3209` — gate runs pre-detect. Mismatches do NOT write `signal_eval_archive` rows; they only increment `vtsEvalCounters.nullReasons.familyFilterMismatch` and `quantNullReasonDetail['family_filter_mismatch']` / `patternNullReasonDetail['family_filter_mismatch']`. So the family-gate effect on ORB is observable via cycle counters, NOT archive SQL.
- Xstock: `server/asset_classes/xstock_spot/eval-cycle.ts:317-326` — same shape: `counters.nullReasonAggregate['family_filter_mismatch']++` then `continue` (no archive write).

**Pre-deploy baseline (capture both):**
```sql
-- (A) Crypto ORB admitted-signal count over 24h — MUST be 0.
SELECT COUNT(*) AS admitted_24h
  FROM signal_eval_archive
 WHERE asset_class='crypto_spot' AND strategy='orb'
   AND reject_stage='admitted' AND captured_at > NOW() - INTERVAL '24 hours';

-- (B) Crypto ORB total invocations over 24h (any reject_stage).
SELECT reject_stage, COUNT(*)
  FROM signal_eval_archive
 WHERE asset_class='crypto_spot' AND strategy='orb' AND captured_at > NOW() - INTERVAL '24 hours'
 GROUP BY reject_stage ORDER BY reject_stage;
```
Expected baseline: (A) = 0 admitted; (B) = either zero rows OR all rows in `strategy_internal`.

**Post-deploy trigger at +1h:** re-run (A) and (B) over `captured_at > <deploy_timestamp>`. **Two simultaneous conditions must hold for revert:**
1. (A) post-deploy > 0 — crypto ORB has produced an admitted signal that wasn't there pre-deploy.
2. (B) reveals a new reject_stage value that didn't appear pre-deploy.

**Revert action:** remove the single line `orb: 'breakout',` from `STRATEGY_FAMILY_MAP` in `server/config/canonical-regime-strategy-map.ts:817`. ORB returns to no-family-entry → family-eligibility gate skipped (pre-deploy behavior). Ship the rest of the batch unchanged. Document revert in completion report.

**Family-gate counter check (defensive):** also inspect the cycle counter delta:
```bash
# At +1h post-deploy, on staging PM2 logs:
pm2 logs dawntrader --lines 200 --nostream | grep -E "vtsEvalCounters.*familyFilterMismatch"
```
Sudden spike in crypto `familyFilterMismatch` for ORB (compared to pre-deploy baseline cycles) → likely benign (the family gate is now applying to ORB), but confirms the gate change is taking effect.

### -1.8 — G12 verification gate (Langston edit #6, with rev2 wording clarification)

| Gate | Acceptance criterion | Verification |
|---|---|---|
| **G12 — Pattern strategy params** | When pattern strategies fire on first xstock signal, the `getCachedNumbersForModule` resolution returns either an xstock-scoped row OR a wildcard fallback (the unit test from rev2 edit #5 covers the wildcard-fallback case as a documented behavior). No `undefined` resolution paths. | (1) Unit test — `getCachedNumbersForModule('strategy.morning_star', {assetClass: 'xstock_spot', ...})` returns wildcard values explicitly (no undefined). (2) Completion-report callout — first-fire log inspection NOTED in the report (NOT a runtime per-fire log line, per Langston rev2 wording confirm: this is a one-time observation captured in the completion report, not a recurring log statement). |

### -1.9 — Counter accounting (Langston edit #7)

Added `XstockEvalCycleCounters.patternRejectByMinHistory: number` — increments when pattern-filter rejects a pair on the OHLC depth check (Layer-1 hardcoded 60-bar floor). Will instantly spike to ~all pairs if §-1.1's Option B implementation has a bug.

Also added `XstockEvalCycleCounters.patternFanOut: number` already in scope §2.3 (already there).

### -1.10 — Calibration debt callouts (must appear in completion report)

Langston rev2 acknowledged: the hardcoded 60-bar floor in `pattern-filter.ts` AND the equivalent in `global-filter.ts:109` should ultimately move to `module_constants` (e.g. `pattern_pool_gates.min_bars_for_eval`, `global_filter.min_bars_for_eval`). **Not in scope for this batch** (parity with `global-filter.ts` is the right move for now per CLAUDE.md §5 NO PATCHES — don't disagree with existing convention mid-stream). **MUST be flagged in completion report's "Layer-3 calibration debt" section** alongside §-1.2 (pattern strategy module_constants wildcard-only) and §-1.3 (scanPatterns ATR-multiplier calibration).

---

## 0. SIM-mandatory blast-radius analysis (CLAUDE.md §9 + ASSET_CLASS_ONBOARDING_WORKFLOW §"Step 4 — Hidden crypto-assumptions audit")

Components touched by this batch + their UPSTREAM / DOWNSTREAM / SHARED STATE / BACKGROUND EXECUTION / BLAST RADIUS, sourced from `1-system-manual/SYSTEM_IMPACT_MAP.md`.

### 0.1 — `server/asset_classes/xstock_spot/eval-cycle.ts` (heavy refactor)

- **SIM coverage:** not separately catalogued (B79.0m.b NEW file). Inherits the xstock scanner entry at SIM line 1431+.
- **Upstream:** xstockSpotScanner (calls `evaluateXstockPairForVTS` per fresh pair); MCE (`getMarketContextEngine().computeContext(symbol, ohlc, lastPrice, volume24h, _, _, 'xstock_spot')`); `screener_filters` row reads via `storage.getScreenerFilters`; `module_constants` reads via `getCachedNumberRequired`.
- **Downstream:** `signal_eval_archive` (INSERTs per evaluation); `vts_open_trades` (INSERTs via `registerOpenVtsTrade`); `XstockEvalCycleCounters` returned to scanner (surfaced via `/api/xstocks/filter-diagnostics`).
- **Shared state:** `openVirtualTrades` Map (process-scoped, written by `registerOpenVtsTrade`); `lastSetupHash` Map (assetClass-keyed via `isIdenticalXstockSetupSuppressed`); `recentCloses` map (assetClass-keyed); `vtsEvalCounters` (process-scoped accumulator, partitioned by counter object, not asset class — xstock has its own counter struct).
- **Background execution:** runs synchronously per pair within the xstockSpotScanner 30s tick. Hot path; per-cycle latency budget ≤ 100ms p95 per B79.0a load test gate.
- **Blast radius:** **HIGH** — every xstock signal flows through this file. Refactor changes the data flow (pattern path + fan-out add new iteration shape). Crypto path untouched (separate file `vts-runner.ts:runPhase10SimulationCycle`).
- **Q1 — hidden crypto assumptions inside?** None at the eval-cycle level. `getMarketContextEngine().computeContext` is asset-class-aware (B79.0m.b synthesized neutral DBS for xstock). `callStrategyDetect` is family-agnostic. `computeFinalScore` is pure math.
- **Q2 — crypto-only things that shouldn't run?** ✅ Already gated: `getXstockMarketOpenUTC` gate, B79.0m.b SQE-removal, asset-class-aware setup-hash. The pattern-path addition needs to use `scanPatterns(candles, symbol)` which is asset-class-agnostic by design (pure geometric pattern matching).
- **Q3 — xstock-only new functionality?** Pattern path + family fan-out are NEW behavior shape, not net-new functions. `pattern-filter.ts` is the new file.
- **Q4 — shared global state collisions?** Setup-hash key is `assetClass-keyed` (B79.0m.b R6). Log lines tagged `[B79.0m.b2][EVAL]`. Counter accumulator is `XstockEvalCycleCounters` (cycle-scoped, separate from crypto's `vtsEvalCounters`). No collision.
- **Q5 — exit-path cleanliness?** EXIT-PRICE routing done in `c0a69fb7d` (vts-runner.ts:1985-2074). B73 REPLAY path uncovered — fixed in this batch (Obj 4).

### 0.2 — `server/asset_classes/xstock_spot/pattern-filter.ts` (NEW)

- **SIM coverage:** new file; will be added to SIM in governance step.
- **Upstream:** `screener_filters` (vts_pattern / active_pattern row read); OHLC bars from `eval-cycle.fetchXstockOHLC()`.
- **Downstream:** `eval-cycle.ts` only (single consumer).
- **Shared state:** none.
- **Background execution:** synchronous per pair (called inside `evaluateXstockPairForVTS`).
- **Blast radius:** **LOW** — leaf module, pure DB row + arithmetic.

### 0.3 — `server/strategies/orb.ts` (LONG-only fix)

- **SIM coverage:** not separately listed (B79.0d strategy file).
- **Upstream:** none (pure detect function).
- **Downstream:** invoked by `callStrategyDetect` from both crypto (`runPhase10SimulationCycle`) AND xstock (`eval-cycle.ts`). **CROSS-ASSET TOUCH.**
- **Q4 risk — does this change affect crypto?** ORB strategy entry in `STRATEGY_FAMILY_MAP` is being added (currently absent). For crypto: ORB is enabled for xstock_spot only per DB strategy_gates rows (`crypto_spot` has no row → default-open). However, `runPhase10SimulationCycle` already runs the family-eligibility gate; adding `orb: 'breakout'` makes ORB only eligible for crypto pairs that pass the `breakout` family IMF. That's a behavior change for crypto. **Verify with no-touch fence + strategy fire-rate audit on crypto post-deploy.** Alternative: gate the `STRATEGY_FAMILY_MAP['orb']` entry behind an asset-class check, but `STRATEGY_FAMILY_MAP` is asset-class-agnostic by design.
- **Resolution:** the `breakout` family entry is conservative for ORB (Opening Range Breakout literally IS a breakout setup), and on crypto the ORB strategy is invoked but disabled by `strategy_gates` default-open rules only if no DB row exists — crypto signal-orchestrator skips disabled strategies via `isStrategyEnabledForAssetClass`. Crypto fire-rate impact = minimal (ORB never fires on crypto today; no crypto row in regime-strategy map for ORB except `STRUCTURAL_TRANSITION` and `IMPULSE_EXPANSION` which are infrequent on crypto). Will monitor crypto byStrategy counter for any regression.
- **LONG-only fix:** down-break branch returns null with `setNullReason('sell_disabled_long_only')`. Affects ANY consumer of ORB detect (crypto + xstock). Crypto impact = zero (ORB never opened a SELL trade on crypto pre-fix per `vts_open_trades` audit), so this is a documentation-cleanup-equivalent change for crypto + a real bug fix for xstock.
- **Blast radius:** **MEDIUM** — touches a shared strategy file; behavior change for crypto is provably zero but verification SQL required.

### 0.4 — `server/config/canonical-regime-strategy-map.ts` (one-line addition + comment)

- **SIM coverage:** SIM lines 573, 595 (taxonomy registry).
- **Upstream:** none — TypeScript SSOT for regime→strategy + STRATEGY_FAMILY_MAP.
- **Downstream:** `vts-runner.ts` (family-eligibility gate), `signal-orchestrator.ts` (active-trading dispatch), `eval-cycle.ts` (xstock family gate), Drift Dashboard, strategy display name lookup.
- **Shared state:** module-load constant.
- **Blast radius:** **MEDIUM** — single line affects multiple consumers, but addition is purely additive (orb was previously absent → bypassed gate → now gated to breakout lane).

### 0.5 — `server/services/exit-strategy-replay-service.ts` (asset-class branch)

- **SIM coverage:** SIM Layer 7 area; B73 framework.
- **Upstream:** Closed trades from `markOpenTradeClosed` (async fire-and-forget); OHLC via `ohlcCache.getOHLCData(symbol, 1, ...)` (Kraken-crypto-REST only today).
- **Downstream:** `exit_strategy_alternates` table (INSERT per variant).
- **Shared state:** none persistent in-process; SQL inserts only.
- **Background execution:** async, fired post-close; not in latency-critical path.
- **Blast radius:** **MEDIUM** — wrong-asset OHLC lookup leads to empty replay rows for xstock trades, silently. Fix adds an asset-class branch to query `xstock_spot_ohlc_1m` for xstock symbols. Crypto path unchanged.
- **Q5 cross-check:** the per-trade replay window is up to 7 days × 1440 min = 10,080 1-min bars. For xstock, the `xstock_spot_ohlc_1m` table is 13-partitioned (B74); a single-trade query over 7d covers ~1-2 partitions → fine. Index on `(symbol, interval_begin DESC)` already exists.

### 0.6 — `shared/schema.ts` (Drizzle drift fix)

- **SIM coverage:** SIM lines 705, 726 (screener_filters table).
- **Production DB index:** `screener_filters_mode_class_path_idx ON (mode, asset_class, filter_path)` — correct.
- **Drizzle schema file:** declares `uniqueModePath ON (mode, filterPath)` — STALE (B79.0m.a added the asset_class scoping in DB but missed updating the schema source).
- **Impact today:** Drizzle migration generator + `db push` could attempt to drop the production unique index. No production migration currently pending, so this is dormant drift.
- **Fix:** update the TS schema to match production index name + columns. No DB migration runs because production already matches the desired final state.
- **Blast radius:** **LOW** in scope of THIS batch (cosmetic + future-proofing). HIGH if left undone before any future migration touches screener_filters.

### 0.7 — DB migrations (DDL + seed)

- New SQL file `drizzle/migrations/2026-05-11-b79-0m-b2-pattern-rows-and-gates.sql` containing the 3 INSERT statements from scope §"DB seed values".
- Idempotent via `ON CONFLICT DO NOTHING`.
- No table-altering DDL.

---

## 1. Verified ground truth on staging (2026-05-11 19:25 UTC)

### Pipeline state (from `/api/xstocks/filter-diagnostics`)

- Last scan: 260 pairs entered, 259 passed global (1 failed `min_price`).
- Family IMF: 498/1295 family-row evaluations passed across 5 families. Pattern path: 0 (no row → applicable=false).
- `familyQualifiedUnique=169` (single-pair count, single-iteration current logic), `destinationCount=169` → fan-out absent.
- Pattern survivors: 0 — confirms pattern path is dead at the DB + code level.
- Per-family breakdown: vts_trend 161/259, vts_reversal 7/259 (DI-fail dominant), vts_breakout 161/259, vts_oscillator 0/259, vts_strong_trend 169/259.
- VN-rejection dominates family-IMF (402/1295 fails = 31%) — calibration target post-pattern-flow.

### Trade state (psql)

```
SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='xstock_spot';  -- 0
SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='crypto_spot';  -- 228
```

### Strategy enablement (DB authoritative)

19 strategy_gates rows for xstock_spot. 10 enabled:
| # | Strategy | Family | Path | LONG-only |
|---|---|---|---|---|
| 1 | breakout | breakout | quant | (verify) |
| 2 | mean_reversion | reversal | quant | (verify) |
| 3 | range_trade | reversal | quant | (verify) |
| 4 | sma_trend_ride | trend | quant | (verify) |
| 5 | vwap_bounce | breakout | quant | (verify) |
| 6 | vwap_pullback | trend (+strong_trend multi) | quant | (verify) |
| 7 | inside_bar_reversal | pattern | pattern | ✅ confirmed |
| 8 | morning_star | pattern | pattern | ✅ confirmed |
| 9 | pivot_shift | hybrid (trend+pattern eligible) | pattern + quant | ✅ confirmed |
| 10 | orb | (missing from map; adding `breakout`) | quant | ❌ **down-break SELL branch present — fix in this batch** |

9 disabled: `abcd_long`, `adaptive_flow`, `defensive_hedge`, `dhma`, `liquidity_trap`, `reverse_impulse`, `strong_bull_trend`, `support_bounce`, `volatility_edge`.

### DB row inventory (paper + live, xstock_spot)

`screener_filters`:
- 5 quant family rows (paper) + 5 quant family rows (live) — ✅ seeded B79.0m.a
- 1 `active_quant` (paper) + 1 `active_quant` (live) — ✅ seeded B79.0m.b
- 0 pattern rows — ❌ **this batch seeds 2 (paper + live)**

`module_constants`:
- `mce_config.xstock_spot.macro_modifier = 1.0` ✅
- `trailing_exit.xstock_spot.*` ✅ (B79.0m.b TEC migration)
- `strategy_gates.xstock_spot.*` (19 rows) ✅
- `pattern_pool_gates.xstock_spot.{final_score_floor=0.45, max_position_pct=0.50}` ✅ **ALREADY SEEDED** (migration `2026-05-07-b79-xstock-module-constants.sql`, `updated_by='B79_inherit_crypto'`). Pattern-filter.ts consumes via `getCachedNumberRequired`.

---

## 2. Implementation risks + mitigations

| Risk | Mitigation |
|---|---|
| Refactoring `eval-cycle.ts` introduces a regression that stops the quant path from working too | Preserve existing quant-eligibility logic verbatim. The change is ADDITIVE (new pattern path runs alongside; fan-out replaces single-iteration with multi-iteration but each iteration runs the same per-strategy code). Unit test for both code paths. |
| ORB family-map entry breaks crypto behavior | Pre-deploy: confirm via `signal_eval_archive` 7d that crypto ORB has zero `reject_stage='admitted'` rows. Post-deploy: query same SQL at +1h, +24h. If a crypto ORB regression appears, hotfix is to remove the map entry (single line) and accept a separate fix for xstock-only family routing. |
| ORB LONG-only fix breaks an existing SELL-flow on crypto | Confirmed zero crypto ORB SELL signals in 7d archive. Code change is a no-op for crypto, real fix for xstock. |
| B73 replay branch by asset class adds DB load to close-time path | Async fire-and-forget on close; latency budget irrelevant. Per-trade replay = 1 query over 7d × 1m bars (~10k rows worst case) bounded by partition pruning. Safe. |
| Pattern path admits too many pairs initially, drowning the family lanes | Pattern-pool guardrails (`final_score_floor=0.45`) catch the high tail. Default `max_position_pct=0.50` constrains sizing. No flood risk per crypto's same-shape behavior. |
| Family fan-out causes signal_eval_archive volume to balloon | Expected. Each fan-out is a separate eval; archive rows scale linearly with `familyFanOutSum` instead of `familyQualifiedUnique`. Storage budget per B72 inventory: ~40 GB/year crypto today; xstock at 24/5 + smaller universe = ~5-10 GB/year addition. Within Hetzner CPX22 budget. |
| Crypto no-touch fence violation | `eval-cycle.ts` is xstock-scoped. ORB strategy + STRATEGY_FAMILY_MAP touches are cross-asset (low-impact verified above). `exit-strategy-replay-service.ts` is asset-class-branched, preserving crypto path. Schema-file drift fix is cosmetic. **No-touch SQL required at +1h post-deploy + at G10 verification gate.** |

---

## 3. Verification SQL (to run pre + post deploy)

```sql
-- Pre-deploy baseline (capture for comparison):
-- B73 ablation row count crypto 24h
SELECT COUNT(*) FROM exit_strategy_alternates WHERE created_at > NOW() - INTERVAL '24 hours';

-- crypto factor-family emission rate (no-touch fence)
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;

-- crypto byStrategy ORB count 7d (must be zero today; verify post-deploy)
SELECT COUNT(*) FROM signal_eval_archive
WHERE asset_class='crypto_spot' AND strategy='orb' AND created_at > NOW() - INTERVAL '7 days';
-- expected: 0 (ORB not in crypto regime map). After deploy: still 0.

-- xstock pattern row presence post-deploy
SELECT mode, filter_path, lq_min, vn_max, di_min FROM screener_filters
WHERE asset_class='xstock_spot' AND filter_path IN ('vts_pattern','active_pattern');
-- expected post-deploy: 2 rows

-- xstock signal flow post-deploy (after RTH open)
SELECT strategy, reject_stage, COUNT(*) FROM signal_eval_archive
WHERE asset_class='xstock_spot' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY strategy, reject_stage ORDER BY strategy, reject_stage;
-- expected: pattern strategies in pattern rejection stages (not just family); admitted rows possible

-- xstock first open trade
SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='xstock_spot';
-- expected post-RTH: ≥ 1
```

---

## 4. Items deferred from B79.0m.b that are NOT covered by this batch

Per MEMORY current state, B79.0m.b deferred 7 items. Status in B79.0m.b2:

| # | Item | B79.0m.b2 status |
|---|---|---|
| 1 | `getOHLCSourceForTrade` exit-path helper | **Partially covered** (price routing already done in `c0a69fb7d`; B73 replay branch in Obj 4 of this batch) |
| 2 | Skipped-signals asset_class field + filter | DEFERRED — separate UI/diagnostics batch |
| 3 | Per-strategy xstock SQL thresholds (9 strategies on wildcard) | DEFERRED — Layer-3 evidence-driven |
| 4 | Regime classifier 4 remaining branches | DEFERRED — separate sub-batch |
| 5 | Asset-class log tagging refactor | DEFERRED — cleanup pass |
| 6 | 18-strategy null-DBS unit-test matrix | DEFERRED — exercised in production now, explicit matrix later |
| 7 | Comprehensive G1-G9 verification | UPDATED — this batch has its own G1-G11 verification (see scope) |

---

## 5. Files affected (estimated diff sizes)

| File | Change | Approx LOC |
|---|---|---|
| `drizzle/migrations/2026-05-11-b79-0m-b2-pattern-rows-and-gates.sql` | NEW | ~40 |
| `server/asset_classes/xstock_spot/pattern-filter.ts` | NEW | ~80 |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | refactor (pattern path + fan-out) | ~+150 / -50 |
| `server/strategies/orb.ts` | LONG-only fix | ~+3 / -3 |
| `server/config/canonical-regime-strategy-map.ts` | add `orb: 'breakout'` | ~+1 |
| `server/services/exit-strategy-replay-service.ts` | asset-class branch in `fetchOhlcForReplay` | ~+40 |
| `shared/schema.ts` | screenerFilters index drift fix | ~+1 / -1 |
| `server/tests/unit/b79-0m-b2-*.test.ts` | new tests | ~+150 |

Total estimate: ~+465 / -55 lines, plus the new SQL migration.

---

*End of B79.0m.b2 pre-audit. Awaiting Langston Step 2 review.*
