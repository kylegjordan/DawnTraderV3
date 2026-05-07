# BATCH 79 Pre-Implementation Audit (PIA)

**Per CLAUDE.md §2 Step 2 + scope §10. Gate before implementation kickoff.**

**Date:** 2026-05-07 evening (post-Langston-compact + post-CC-compact)
**Scope reference:** `BATCH_79_SCOPE.md` rev 7 (commit `ab73edee9`)
**Branch:** `migration/aws-supabase`

---

## §0. Executive Summary

| Finding | Severity | Resolution |
|---|---|---|
| PairFailureTracker — no asset_class introspection but per-instance scoping is sufficient | LOW | Dedicated AdaptiveScanManager-instance for xstock_spot injects own PairFailureTracker. No crypto path change. |
| AdaptiveRatioManager — singleton uses unscoped telemetry + SQL `getPoolComparison(regime, mode)` | **HARD BLOCKER** | Add `assetClass` param (default `'crypto_spot'`) to `computeAdaptiveRatio` + `getPoolComparison` + in-memory `getPoolPerformanceComparison`. SQL adds `AND asset_class = $X`. Backward-compatible. |
| TelemetryAggregator — internal pair-keyed maps unscoped by asset_class; getTopPairs/getRotationalPairs/getPoolPerformanceComparison return mixed-class results | **HARD BLOCKER** | Add `assetClass?` filter param (default `'crypto_spot'`) to those getters. Filter by entry.assetClass. New entries written with assetClass. Backward-compatible. |
| predictiveConfidence rolling window — per-entry on telemetry; same partitioning fix as TelemetryAggregator | RESOLVED BY ABOVE | Filter cascades through aggregator partitioning. |
| drift-dashboard-aggregator scoped to `crypto_spot` (B78) | ✓ DONE | No change. |
| `screener_filters` — needs `asset_class` (text NOT NULL DEFAULT 'crypto_spot') + `tunable_status` (text DEFAULT 'active') columns | SCHEMA MIGRATION | Drizzle migration. xstock_spot row inserted post-migration with NO max_price cap (per Kyle). |
| `paper_sim_trades` / `signal_eval_archive` / `paper_sim_open_positions` / `regime_factor_alternates` — verify asset_class column presence | SCHEMA AUDIT | Run psql audit; add missing columns with default 'crypto_spot' before xstock signals enter pipeline. |
| Subagent uncommitted work (10 files) is rev 2 era; rev 7 has 3 substantive deltas | RECONCILIATION | (a) remove max_price cap; (b) enable pattern path with 3 strategies; (c) family-path SSOT asset-class-prefixed keys; (d) ORB strategy file Q-D-gated; (e) dedicated scanner not universe-merge. |
| Symbol-normalizer `server/utils/symbol-normalize.ts` not yet created | NEW UTILITY | Build before xstock scanner intake. |
| Asset-class-aware data-freshness gate — equity silence during off-hours is normal vs crypto silence is alarm | NEW LOGIC | Add `getFreshnessGate(assetClass, isMarketOpen)` helper. |
| `market-hours.ts` for xstock_spot (24/5 + US holidays) | UNCOMMITTED | Verify present in working tree; commit. |
| TEC stop-freeze during market-closed | NEW LOGIC | Add `if (!isMarketOpen(assetClass)) return SKIP` guard at TEC stop-evaluation entry. |
| Resource Management §11 — pre-deploy synthetic 1.3× load test | VERIFICATION GATE | Run pre-push on staging; defer hard-gate to Step 7. |

**Two telemetry partitioning fixes are HARD BLOCKERS** per scope §10. Plan: scoped, backward-compatible param additions defaulting to `'crypto_spot'` so legacy callers are untouched. Cross-asset corruption risk eliminated before any xstock signal flows.

---

## §1. SIM Component Analysis

Per scope §10 SIM consultation list (15 components). Each line: component → finding → action.

### §1.1 Scanner / Universe / Cooldown layer

1. **`server/services/market-scanner.ts`** — currently builds `allPairs` from Kraken Spot REST only. Subagent attempted universe-merge of xStocks (lines L550-570 area). **Decision per scope §2.Q2.1: DEDICATED scanner, not merge.** Action: rip subagent's merge logic; instead, build separate `xstockMarketScanner` instance pattern (or factory) consuming `xstocks-universe.json`. Crypto path UNTOUCHED.

2. **`server/services/adaptive-scan-manager.ts`** — `AdaptiveScanManager` constructor accepts injected `telemetry` and `failureTracker`. ✓ PARTITION READY by-instance. Action: instantiate second `AdaptiveScanManager` for xstock_spot in scanner bootstrap.

3. **`server/services/adaptive-scan-manager.ts:52` `PairFailureTracker`** — `Map<string, FailedPairEntry>` keyed by symbol only. By-instance partitioning is sufficient (separate tracker per scanner). Action: confirm two failure trackers in scanner bootstrap. No code change to PairFailureTracker class.

4. **`server/services/adaptive-ratio-manager.ts`** — **HARD BLOCKER.** Singleton uses global `getTelemetryAggregator()` + SQL `getPoolComparison(regime, mode)` with NO asset_class filter. Equity records would corrupt crypto's pool comparison. Action:
   - Add `assetClass` param to `computeAdaptiveRatio(regime, mode, assetClass='crypto_spot')`
   - Plumb `assetClass` to `getPoolComparison` (SQL) + `getPoolPerformanceComparison` (in-memory)
   - SQL: `AND asset_class = $X`
   - Two AdaptiveRatioManager instances OR single instance with assetClass param plumbed through

### §1.2 Math / Regime / MCE layer

5. **`server/core/metrics/directional-bias.ts` (DBS)** — formula multi-timeframe-agreement-based. Per scope §-3 glossary: **formula-direct Day 1** = same coefficients on xstock OHLC. No code change needed; DBS is already pure-math given OHLC input. Coefficient tuning deferred to B79.1.

6. **`server/core/metrics/market-regime.ts` `calculatePairRegime`** — subagent ADDED asset-class dispatch (`if (assetClass === 'xstock_spot')` branch). Action: verify dispatch correctness against rev 7 (vol thresholds halved, DX tightened, DBS same, momentum halved). Confirm asset-class-prefixed family-path keys per §-2.5.

7. **`server/services/market-context-engine.ts` (MCE)** — per-pair 60s TTL cache. Macro modifier composes BTC dom + funding + mcap mom (crypto-specific). For xstock_spot: **macro_modifier = 1.0 default until B79.3** per Langston scope §-2 row 7. Action: add `if (assetClass === 'xstock_spot') return 1.0;` short-circuit in MCE macro composition. NO new equity macro inputs in B79.

### §1.3 SQE / Cost / Execution layer

8. **`server/core/filters/signal_quality_evaluator.ts`** — subagent edited. Need to verify asset-class-aware gates for: predictiveConfidence threshold (60 crypto vs 70 xstock per Langston), getDynamicROIThreshold asset-class lookup, di_min/adx_min/momentum_min from xstock SQE seeds. Verify against rev 7.

9. **`server/core/math/cost-model.ts`** — subagent added asset-class friction lookup. Verify XSTOCK_SPOT_FRICTION values match scope §11 / Stage 11. perPairOverrides DEFERRED to Layer 3 per Q11.1.

10. **`server/services/paper-execution-engine.ts`** — admission path. Action: verify position-sizing $1000/~$150 works for fractional xstocks. No code change expected; verify in Step-7.

11. **`server/services/trailing-exit-controller.ts` (TEC)** — Action: ADD market-closed-freeze guard. Pseudo:
    ```ts
    if (!isMarketOpenForAssetClass(position.assetClass)) {
      log('[B79][TEC_FREEZE] skipping stop-eval, market closed');
      return; // skip stop-eval; resume on next open
    }
    ```
    Apply at top of stop-evaluation entry-point. Crypto returns true for `isMarketOpen('crypto_spot')` always; xstock_spot consults market-hours.ts.

### §1.4 Pricing / Archive / Calibration layer

12. **`server/services/live-pricing-adapter.ts`** — **DEFER to B79.5.** B79 VTS uses 1m archive lookup from B74 `equity_spot_ohlc_1m`. Real-time xStock prices not needed for shadow-mode. Phase 19 active-trading prerequisite. Action: NO change; document as deferred in workflow doc.

13. **`server/services/passive-archive/equity-spot-archiver.ts` (B70/B74)** — Action: verify staleness gate logic. If equity tick is older than `WS_CACHE_FALLBACK_MS`, behavior depends on `isMarketOpen`: open = ALARM, closed = expected. Apply asset-class-aware freshness gate.

14. **`server/services/drift-dashboard-aggregator.ts`** — B78 already scoped to `asset_class='crypto_spot'`. ✓ Action: NO change; verify second aggregator path for xstock_spot OR shared filter param. Defer cross-asset aggregator to B79.1.

15. **`server/services/portfolio-risk-manager.ts`** — Action: audit symbol-cluster prevention. Crypto uses symbol-similarity grouping (catches SOL ecosystem). For xstock_spot, sector-aware clustering required (Stage 12.5). **DEFER sector wiring to B79.6** per scope; ship dormant `sector` field placeholder in xstocks-universe.json so cluster prevention can become sector-aware later. Layer 3 may surface earlier need.

---

## §2. Schema Audit Plan (psql)

To execute via Hetzner SSH against Supabase. Captured here as the audit plan; results validated post-deploy.

```sql
-- 1. screener_filters
\d screener_filters
-- Expected: id, mode, [filter columns]. Missing: asset_class, tunable_status.
-- Migration adds both with crypto_spot default.

-- 2. paper_sim_trades
\d paper_sim_trades
-- Expected to have asset_class (B70+ era). Verify.

-- 3. signal_eval_archive
\d signal_eval_archive
-- B70 unified archive — should have asset_class column.

-- 4. regime_factor_alternates
\d regime_factor_alternates
-- B69 + B78 work — should have asset_class column.

-- 5. paper_sim_open_positions
\d paper_sim_open_positions
-- Verify asset_class column.

-- 6. module_constants
SELECT column_name FROM information_schema.columns
WHERE table_name='module_constants' ORDER BY ordinal_position;
-- Expected: scope dimension(s) for asset_class scoping.
```

**Migration plan:**
- Drizzle migration `add_asset_class_to_screener_filters` adds two columns + backfills 'crypto_spot' default.
- For tables found missing asset_class, add column with default 'crypto_spot' + backfill before xstock signals enter.
- Apply BEFORE first xstock_spot scanner cycle.

---

## §3. Telemetry Partitioning Audit (HARD BLOCKER per scope §10)

### §3.1 Findings

| Component | Scope by | Partitioned? | Risk |
|---|---|---|---|
| PairFailureTracker | per instance | YES (by-instance) | LOW |
| AdaptiveScanManager | per instance | YES (by-instance) | LOW |
| AdaptiveRatioManager | singleton | NO | **HIGH** — equity records flip crypto's idealRatio |
| TelemetryAggregator | singleton | NO | **HIGH** — `getTopPairs`/`getRotationalPairs`/`getPoolPerformanceComparison` return mixed-class |
| predictiveConfidence rolling | per-entry on telemetry | NO (transitively) | **HIGH** — equity confidence values inflate crypto rolling stats |
| `getPoolComparison` SQL | (regime, mode) | NO | **HIGH** — query aggregates trades across all asset classes |

### §3.2 Resolution Plan (CC proposal — Langston review)

**Cross-cutting resolution: add `assetClass` parameter (default `'crypto_spot'`) at every telemetry boundary.** Default preserves legacy behavior for crypto callers. Backward-compatible. xstock pipeline must pass `assetClass='xstock_spot'`.

Specific edits:

```ts
// telemetry-aggregator.ts
getTopPairs(count: number, assetClass: AssetClass = 'crypto_spot'): string[]
getRotationalPairs(count: number, allPairs: string[], assetClass: AssetClass = 'crypto_spot'): string[]
getPoolPerformanceComparison(assetClass: AssetClass = 'crypto_spot'): PoolPerformanceComparison
recordEntry(...) // ensure entry.assetClass is set
// Filter all internal map iteration by entry.assetClass

// adaptive-ratio-manager.ts
async computeAdaptiveRatio(
  regime: MarketRegime,
  mode: 'live' | 'paper' = 'live',
  assetClass: AssetClass = 'crypto_spot'  // NEW
): Promise<AdaptiveRatio>
// Plumb to getPoolComparison + getPoolPerformanceComparison

// getPoolComparison SQL
WHERE regime = $1 AND mode = $2 AND asset_class = $3
```

**Caller updates:**
- AdaptiveScanManager passes `assetClass` to `computeAdaptiveRatio` (constructor accepts assetClass).
- Bootstrap creates two AdaptiveScanManager instances: crypto_spot (default) + xstock_spot.
- Telemetry recordEntry call sites populate `assetClass` field (currently absent from many call sites — need sweep).

**Defensive guard:** if `assetClass` is unset on an entry (legacy/migration), default to 'crypto_spot' and emit `[B79][TELEMETRY_LEGACY] assetClass missing for entry, defaulting to crypto_spot` once. This ensures legacy data continues to work for crypto while xstock data is explicitly scoped.

---

## §4. Subagent Reconciliation Plan

10 files modified pre-rev-7. Three substantive deltas to apply:

| File | Subagent state | Rev 7 expectation | Action |
|---|---|---|---|
| `shared/asset-classes.ts` | XSTOCK_SPOT enum + regex + resolver | ✓ | Verify regex catches `BASE/USD` form; xstock subagent regex was for `BASEx/USD` — mismatch with WS feed format. Fix. |
| `server/asset_classes/xstock_spot/regime-thresholds.ts` | 14 named exports | ✓ | Verify against rev 7 §-2.5 (asset-class-prefixed family-path keys). |
| `server/asset_classes/xstock_spot/friction.ts` | XSTOCK_SPOT_FRICTION | ✓ | Verify values; rev 7 spec: feeRateTaker=0.0026, feeRateMaker=0.0016, spread=0.0012, slippage=0.0005, maxCostBound=0.005. |
| `server/asset_classes/xstock_spot/index.ts` | re-exports | ✓ | Verify export shape |
| `server/asset_classes/crypto_spot/friction.ts` | linter touched | NO MEANING CHANGE expected | Diff inspect |
| `server/config/canonical-regime-strategy-map.ts` | xstock_spot strategy display names | rev 7: 6 quant + 3 file-based pattern (inside_bar_reversal/morning_star/pivot_shift) + ORB Q-D-gated | **REWORK**: pattern path was scope-disabled in rev 2; rev 7 enables 3 specific patterns. Add ORB entry tagged Q-D-gated. |
| `server/core/filters/signal_quality_evaluator.ts` | asset-class-aware gates | rev 7: confidence_threshold=70 xstock, di_min_quant=18, adx_min=18, momentum_min=0.002, di_min_pattern=10 | Verify; PARTITION TELEMETRY (predictiveConfidence) per §3 fix. |
| `server/core/math/cost-model.ts` | asset-class friction | ✓ | Verify lookup. |
| `server/core/metrics/market-regime.ts` | asset-class dispatch | ✓ | Verify branch; SSOT keys per §-2.5. |
| `server/services/market-scanner.ts` | universe merge | rev 5 §C: **DEDICATED scanner, not merge** | **REWORK**: rip merge logic; add separate `XstockMarketScanner` instance OR scanner-factory pattern. |

**New files to create (not in subagent scope):**
- `server/utils/symbol-normalize.ts` — symbol normalizer utility
- `server/asset_classes/xstock_spot/market-hours.ts` (already in working tree; verify)
- `server/asset_classes/xstock_spot/pattern-pool-filters.ts` — guardrails for pattern path
- `server/strategies/orb.ts` — ORB strategy file (Q-D-gated activation)

**No-touch rule:** crypto_spot path code paths must be untouched. Diff review (Step 4) flags any unintended crypto edit.

---

## §5. ASSET_CLASS_ONBOARDING_WORKFLOW.md Plan

Per scope §6.2 template. Section H.1 = xstock_spot worked example, populated as B79 implementation lands. Tier-2 governance, mandatory.

Sections A through I per template. Section H.1 cross-references to BATCH_79 commit hashes + completion report. Living document; "what we'd do differently" post-mortem populated 7 days post-go-live.

---

## §6. Resource Management Verify Checklist (per scope §11.5)

Run pre-push (synthetic 1.3× load test on staging) + post-deploy:

- [ ] Hetzner load average pre vs post (acceptance: <2× baseline during equity-market-open)
- [ ] PM2 process memory growth (acceptance: <10%/hr)
- [ ] Supabase connection count (acceptance: stays under plan ceiling)
- [ ] API rate-limit errors (acceptance: zero new error types)
- [ ] Scan cycle duration p95 (acceptance: <40s during equity-market-open; current crypto p95 ~30s)
- [ ] Backpressure policy: `[B79][BACKPRESSURE_SKIP]` log line emitted on simulated overload
- [ ] CPX22 baseline pinned + recorded pre-deploy

**Pre-deploy load test gate:** simulate 30-pair xstock scan cycle running concurrently with crypto. If sustained CPU >85% or scan cycle p95 >40s, throttle xstock cadence to 60s before push. Document baseline in completion report.

---

## §7. PIA Completion Checklist

- [x] §1 SIM 15-component analysis
- [x] §2 Schema audit plan written; execution at psql gate pre-migration
- [x] §3 Telemetry partitioning audit — 3 hard blockers identified + resolution plan
- [x] §4 Subagent reconciliation plan
- [x] §5 ASSET_CLASS_ONBOARDING_WORKFLOW.md plan
- [x] §6 Resource Management verify checklist
- [ ] **Langston review of this PIA** — gate before Step 3 implementation kickoff

---

## §8. Open questions for Langston (PIA gate)

1. **Telemetry partitioning resolution approach** — agree with `assetClass` param + default `'crypto_spot'` cross-cutting fix? Alternatives considered: (a) separate aggregator instances per asset class, rejected because singleton call-sites are pervasive and refactor risk is large; (b) shared aggregator with internal partition map keyed by assetClass, equivalent semantically but adds a layer. CC lean: param plumbing.
2. **Subagent universe-merge rip vs incremental refactor** — rip-and-rebuild dedicated scanner OR refactor merge into dedicated path? CC lean: rip; surface area is small and avoids hybrid drift.
3. **Pattern-pool path enablement Day 1** — rev 7 specifies 3 strategies (inside_bar_reversal, morning_star, pivot_shift). Confirm these 3 are correct + scope-disable the other 6 via `isStrategyEnabledForAssetClass(strategy, 'xstock_spot')`.
4. **ORB Q-D-gated activation mechanism** — file shipped but inactive. Activation gate: env flag? DB tunable? Both? CC lean: `module_constants` row `xstock_spot.orb_enabled = false` (DB-tunable, no redeploy).
5. **TEC stop-freeze placement** — top of `evaluateStop()` entry vs per-position guard? Either works; CC lean: top of entry to short-circuit cleanly.
6. **AdaptiveRatioManager singleton vs instance-per-asset-class** — Question 1 resolution favors singleton-with-param. Confirm.
7. **Pre-deploy load test mechanism** — synthetic 1.3× load: how generated? Replay 1.3× of historical scan cycles? Stress-shim that doubles batch sizes? CC needs a methodology call.

**Sending to Langston via watchdog `--first-byte-timeout 240` per B79 substantive review tuning.**

---

*End PIA.*
