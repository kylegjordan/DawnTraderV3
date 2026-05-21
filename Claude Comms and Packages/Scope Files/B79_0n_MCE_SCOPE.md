# B79.0n.MCE — Scope (rev5 — post Q-VI(a) absorb dead-code decision)

> **rev5 changes (2026-05-21 PM, secretarial after Langston pre-audit v2 FINAL ACK + Q-VI option (a) decision):**
> - **Q-VI(a) ABSORB dead-code cleanup** — `cost-metrics.ts` orphan file + `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` get DELETED in this batch. Test dependency at `dynamic_sizing.test.ts:283` disposition reported in Step 3 diff before push.
> - **Migration scope shrunk** — `cost_model.default_avg_return` row DROPPED from §3.5 (dead-code consumer gone). Only `dbs_calculation.min_sample_count` remains in migration.
> - **Numeric deltas:** net row delta **+2 → +1**; Step 7 SQL pre-deploy expects **1 wildcard** (not 2); post-deploy expects **2 explicit rows** (not 4); §5.2 #8 cache-refresh log line **N ≥ 2** (modules: dbs_calculation only); rollback stub adjusts to 1 wildcard + 2 rows.
> - **Cost-model.ts surface APIs unchanged** — still REQUIRED-AssetClass + perp fail-hard at `getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics`. Those are LIVE production code paths (verified in pre-audit v2 §3.5 — 9 production callers of getCachedCostMetrics).
> - **5 verification asks C1-C5** from Langston Step 2 v2 ACK folded:
>   - C1: Step 3 verifies migration WHERE clause is `constant_name = 'min_sample_count'` only (post-Q-VI: a single name); Step 7 verification gate keeps the `sector_coverage_floor` xstock_spot row protection assertion.
>   - C2: Step 3 implementation diff flags any `getCachedCostMetrics` caller that needs the STORAGE-style `resolveAssetClass(symbol, 'kraken')` interim (visible, not silent).
>   - C3: MCE deploy target ≥2026-05-22T12:00Z confirmed (§5.4 timing).
>   - C4: SYSTEM_MANUAL §10 governance pattern section includes the 3-cache-layer table verbatim.
>   - C5: ASSET_CLASS_ONBOARDING_WORKFLOW §3.3 learnings capture the "grep false-positive on `assetClass: <var>`" lesson.

> **rev4 corrections (2026-05-21 PM, after Kyle thoroughness push-back exposed pre-audit v1 errors):**
> - **§3.4 row 1 DROPPED — `directional-bias-store.ts:59` already per-class-resolved** (B-PHASE-A2 2026-05-17). Code site needs no tightening; seed migration §3.5 still removes silent fall-through to wildcard. See pre-audit v2 §0 Correction 1.
> - **§3.4 row 2 (`cost-metrics.ts:35`) — dead-code disposition pending Langston Q-VI.** The `getDefaultAvgReturn → updateCostData → getTransactionCostFactor` chain has zero production callers. Pre-audit v2 §9.5 asks Langston to choose (a) absorb dead-code cleanup, (b) defer, or (c) hygiene-only seed.
> - **§3.4 rows 3-4 (`regime-age-factor.ts:150` + `adaptive-goals-weight.ts:27`) — UNCHANGED**, KEEP WILDCARD per pre-audit v1 §4.
> - **§3.6 caller count refined from 27 → ~22** after v2 reclassification surfaced ~5 sites that are NOT subject to REQUIRED-AssetClass refactor (global aggregators + config introspection methods).
> - **§3.5 seed migration scope:** `dbs_calculation.min_sample_count` STAYS (real impact — removes silent fall-through). `cost_model.default_avg_return` contingent on Langston Q-VI (hygiene-only).
> - **§3.7 + §3.8 + §5.2 #7 + #8 — UNCHANGED from rev3.**
> - **New §2.7 NEW — B-PHASE-A2 interaction guarantee** documenting xStock DirectionalBiasStore singleton + sector_coverage_floor row not disrupted (per pre-audit v2 §1.4).

# B79.0n.MCE — Scope (rev3 — post Step 2 pre-audit ACK)

> **Sub-batch:** 4 of 18 in the B79.0n umbrella v4 arc.
> **Phase:** 15c continuation / Phase 24 (multi-asset onboarding).
> **Dependencies:** STORAGE (closed 2026-05-21, commit `ab3153ce5`). UNIVERSE-DISCOVERY (closed same day, commit `c97ceec81`). HYGIENE (closed 2026-05-21, commit `6050165cf`).
> **Status:** rev3 awaiting Langston re-ACK. Step 1 ACK + Step 2 pre-audit ACK both received; rev3 folds Step 2 dispositions + 5 additional concerns + bar-interval investigation finding.
> **Standing rules applied:** umbrella rev 4 §1.5 B72 prior-arc context section (§2 below) + CLAUDE.md §3.3 onboarding-learnings placeholder + §11 NO-SILENT-FALLBACK doctrine + §2.2 per-metric crypto regression-lock + §2.3 crypto-by-construction-NONE invariant.

> **Rev3 changes (2026-05-21 PM, post-Langston Step 2 pre-audit ACK + bar-interval investigation):**
> - **Q-I bar-interval RESOLVED — §3.7 NEW.** Investigation found xStock MCE consumes 60-min bars (via `xstock_spot/eval-cycle.ts:335,717` reading `xstock-ohlc-cache.ts:132-135` aggregating from `xstock_spot_ohlc_1m`) and crypto MCE consumes 60-min bars (via `signal-orchestrator.ts:1303` reading `ohlc-cache.ts:78-91` Kraken REST `interval=60`). VTS shadow path (`vts-runner.ts:773-777`) also 60-min. Indicator semantics INVARIANT: 14 bars = 14h, 30 bars = 30h on both classes. Inline comment + stale-comment-fix in `market-regime.ts` (currently says "15-min", actual is 60-min). No indicator-per-class work; ATR/Momentum/ADX hardcoded lookbacks stay as-is with documentation.
> - **Q-II ablation fixes APPROVED — §3.8 NEW.** `regime-age-factor.ts:140` + `multi-tf-agreement.ts:135` get cycle assetClass threading + new unit test in §4 #6.
> - **Q-III TFS desat NULL — §5 PRE-AUDIT noted.** No migration rows for `regime_classifier`; B78 xstock branch in `regime-thresholds.ts` already covers code-level per-class. Completion report notes nullification.
> - **Q-IV per-site dispositions for 5 (d) rows — §3.6 EXPANDED.** 4 of 5 sites are NOT computeContext callers (they read global aggregators / config introspection methods that don't take assetClass) — pre-audit's "18 production MCE sites" over-counted by conflating multiple MCE methods. Only `paper-execution-engine.ts:2021` `getCachedContext(symbol)` needs class-awareness via cache-key extension. Broader `getCachedContext` caller enumeration added as scope-rev3 ask.
> - **Q-V net +2 math CONFIRMED — §5.2 #7 unchanged.**
> - **C1 atomicity (BEGIN/COMMIT + rollback SQL stub) — §3.5 EXPANDED.**
> - **C3 SYSTEM_MANUAL pattern doc — §10 governance gains a "wildcard-retirement-with-seed" migration-pattern section.**
> - **C5 runtime cache-refresh log line — §5.2 #8 NEW** boot log `[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows for asset_class=…` as positive Step 8 signal.

> **Rev2 changes (2026-05-21 PM, post-Langston Step 1 conditional FINAL ACK):**
> - **§2.5 NEW** — Resolver semantic confirmed via `module-constants-service.ts:8-17,108-128` read. Hierarchical most-specific-wins with documented wildcard-as-broadest-scope (Langston's outcome #1). For levers this batch tightens, the wildcard-as-default-for-all-classes behavior IS the silent fallback this batch eliminates — therefore seed migration upgraded to outcome #3 (explicit per-class rows for both crypto and xStock + retire affected wildcards).
> - **§3.5 expanded** — Seed migration now (a) adds explicit `crypto_spot` rows mirroring current wildcard values byte-for-byte, (b) adds explicit `xstock_spot` placeholder-cloned rows, (c) retires the wildcard rows atomically in the same migration. Idempotent via ON CONFLICT + conditional DELETE.
> - **§5.2 #7** — Row-count expectation revised: 2 wildcards retired + 4 explicit rows added = net +2 (but composition changes 2-wildcard → 4-explicit).
> - **§5.4 NEW soak-baseline timing note** — MCE deploy targeted at ≥2026-05-22T12:00Z so pre-deploy 24h baseline window sits fully post-STORAGE/UD/HYGIENE stabilization (per Langston cross-cutting note 3).
> - **§3.4 + §3.5 atomicity note added** — Resolver-key tightening + seed migration MUST ship in the same commit (per Langston cross-cutting note 1).

---

## §0 — TOP-OF-REPORT mandatory disclaimers (umbrella rev 4 §9.1 + §9.2)

**🚨 THIS BATCH DOES NOT ENABLE LIVE XSTOCK MCE ROUTING AT RUNTIME.** Per umbrella sequencing, xStock signals do not reach the MCE consumption path (orchestrator → SQE → RTB → executor) until WIRE-IN closes (sub-batch #16). MCE will continue computing per-symbol regime+DBS+indicators on the xStock universe via the existing VTS scanner shadow path (already live since B-PHASE-A2 2026-05-17). What changes in this batch is that MCE STOPS silently routing xStock callers to crypto's threshold+friction values; instead it routes via REQUIRED `assetClass` parameters with no defaults, the same pattern STORAGE just established at the screener_filters API surface.

**🚨 NUMERIC DELTAS (PREVIOUSLY-STATED-VS-NOW):**
- Sub-batch count: still 18 (no change since umbrella rev 4 ack).
- Caller-site count: pre-audit will enumerate; expect **~15-25 sites** based on the resolver-pattern grep (4 known wildcards in MCE-adjacent metrics + an estimated 10-15 silent-default sites at `calculatePairRegime` and `cost-model` callers). Treat this as a **lower-bound estimate** per the STORAGE onboarding learning §10(b) (compile-driven audit at Step 3 will surface the rest, typically ~20% above pre-audit grep).

---

## §1 — Objective

Close the silent-default asset-class footgun at three MCE surface APIs (`calculatePairRegime`, `cost-model.getFrictionForAssetClass`, MCE singleton `calculateMarketContext`), and tighten the wildcard `assetClass: '*'` resolver keys at 4 MCE-adjacent metric call sites to use the calling cycle's `assetClass` where the lever is asset-class-meaningful. Symmetric to what STORAGE just did for the `screener_filters` API: the path stays additive for crypto (callers continue passing `'crypto_spot'` explicitly), but xStock cycles now stop silently inheriting crypto's threshold+friction+resolver values.

The gap this closes: today, any caller that invokes `calculatePairRegime(ohlcData, dbs, slope, macro, regimeConfig)` without the optional `assetClass` parameter silently routes through the crypto branch (line 215: `assetClass: string = 'crypto_spot'`). The xstock branch at line 227 is already wired by B78, but only fires when callers explicitly pass `'xstock_spot'` — which today is only the VTS scanner shadow path. Once xStock active-trading flows through orchestrator (WIRE-IN), every untouched caller would route xStock signals into crypto's regime thresholds. Same shape at `cost-model.getFrictionForAssetClass` (line 61: `assetClass: string = 'crypto_spot'`), `getDefaultCostComponentsForAssetClass` (line 82), and `getCachedCostMetrics` (line 111).

This batch does NOT calibrate per-class thresholds. xStock `regime_classifier` / `regime_age` / `dbs_calculation` thresholds remain at the values B78 + B72 wired (xstock branch in `regime-thresholds.ts` from B78; module_constants wildcard rows from B72). Per-class calibration is Phase 19 active-trade work, not part of this asset-class-awareness wire-in.

---

## §2 — B72 prior-arc context (umbrella rev 4 §1.5 standing rule — mandatory)

**Reference:** umbrella rev 4 §1.5 row "MCE" — material shrink because B72 already wired the API-side reads.

### What B72 + B72.1 + B72.2 already did for MCE-adjacent modules

| Module | Rows seeded (B72 ship 2026-05-05) | Scope | Source code consumer |
|---|---|---|---|
| `regime_classifier` | 5 rows (TFS desat fields from B67.3.5 era) | wildcard `(*, *, *, *)` | `market-regime.ts` `RegimeConfig.tfs*` reads |
| `regime_age` | 5 rows (incl. B68.4 sustainability bounds) | wildcard `(*, *, *, *)` | `regime-age-factor.ts:150` |
| `dbs_calculation` | 1 lever (`min_sample_count=20`) | wildcard `(*, *, *, *)` | `directional-bias-store.ts:59` |
| `cost_model` | 1 lever (`default_avg_return`) + kraken-scoped fee rows | global default + `(kraken, *, *, *)` | `cost-model.ts` + `cost-metrics.ts:35` |

**Critical distinction:** B72 wired the **API-side discipline** (sync-read via `getCachedNumberRequired` / `getCachedNumbersForModule`, hard-fail on missing row, no silent fallbacks inside the resolver). B72 did NOT seed per-asset-class rows for these modules — most rows stayed at wildcard scope because B72's mandate was the lever-to-DB migration itself, not per-class calibration.

### What this sub-batch picks up vs what stays deferred

| Module / surface | This batch | Deferred (with reason + tracker) |
|---|---|---|
| `regime_classifier` thresholds | **No per-class seed rows.** xStock branch in `regime-thresholds.ts` (B78) supplies xStock-specific thresholds at the code level. The wildcard module_constants rows are TFS desat fields shared across asset classes — verify in pre-audit that B78's xstock thresholds + B72's wildcard TFS desat compose correctly (no asymmetry where xStock TFS desat falls back to crypto-tuned wildcards). | If pre-audit finds the TFS desat fields are asset-class-sensitive, **file as RUNNING_ISSUES sub-issue** and defer per-class seed to **SCORING** sub-batch (#8) — same handoff pattern STORAGE used for `module_constants.sqe_config`. |
| `regime_age` thresholds | **Wildcard scope retained.** Pre-audit verifies that B68.4 sustainability bounds (e.g., `b68_5PathBMomentumMin`) are not asset-class-sensitive. If they are, file as sub-issue + defer. | Same handoff pattern. |
| `dbs_calculation` (`min_sample_count`) | **Resolver-key tightening at `directional-bias-store.ts:59`.** Change `assetClass: '*'` → `assetClass: input.assetClass` so xStock signals consult an explicit xstock_spot row (placeholder-clone of crypto value at seed; Phase 19 calibration replaces). Also line 70 already does explicit `assetClass: 'xstock_spot'` read for a separate knob — confirm both reads are consistent. | RUNNING_ISSUES #115 (umbrella-doc reference; not yet filed) — **filed at this batch's governance close** as a Tier 3 cleanup entry. |
| `cost_model` levers | **Resolver-key tightening at `cost-metrics.ts:35`.** Same pattern — `assetClass: '*'` → `assetClass: input.assetClass`. Plus the no-silent-fallback fix at the 3 `cost-model.ts` surfaces (§3 below). | Per-class lever seed deferred — placeholder-clone xStock from crypto baseline at seed (same pattern STORAGE used). |
| `friction.ts` modules | **Already per-class** (B78 + earlier — `crypto_spot/friction.ts` + `xstock_spot/friction.ts` shipped). Pre-audit verifies the perPairOverrides + slippage rates are well-formed for xStock. | None — already done. |
| Indicators (VWAP / ATR / EMA / BB / RSI) | **Pre-audit enumeration first.** Per umbrella §1.5, "indicator computations that aren't lever-driven" are flagged as remaining work but the scope depends on what the audit finds. If indicators are pure math with no asset-class parameter, no change needed (asymmetry preserved by construction). If any indicator hardcodes a lookback or normalization tuned to crypto behavior, surface to Langston before implementation. | Likely none (math primitives), but pre-audit is the gate. |
| Macro modifier per-class signal | **Out of scope.** Umbrella §5.5 #123 defers external-macro-feed per-class signal to a post-arc B79.x follow-up. | **File as RUNNING_ISSUES #123** at this batch's governance close (Langston v1 item 13 origin). |

**Resolver-key tightening rule (this batch's contribution to the pattern):** at every MCE-adjacent `getCachedNumberRequired` / `getCachedNumbersForModule` call site, the resolver-key `assetClass` field becomes `input.assetClass` (REQUIRED parameter from the caller's cycle context) IF the lever is asset-class-meaningful. Where the lever is genuinely shared across asset classes (e.g., a math constant like Wilder's smoothing factor), wildcard `'*'` stays — documented in code comment.

---

## §2.5 — Resolver semantic + Concern A resolution (rev2 — confirmed via code read)

**Source of truth confirmed:** `server/services/module-constants-service.ts:8-17` (resolution hierarchy docstring) + `:108-128` (`scoreRowForKey` implementation).

```
Resolution hierarchy (most-specific-wins):
  1. (exchange, asset_class, strategy, regime)     — most specific
  2. (exchange, asset_class, strategy, *)
  ...
  6. (*, *, *, *)                                  — global default

If no row matches even the global wildcard, returns undefined. Callers should
handle undefined explicitly (no silent fallback).
```

`scoreRowForKey` (line 108): wildcard row dimensions score 0, concrete-dim matches score by weight (regime=8, strategy=4, asset_class=2, exchange=1), concrete mismatches REJECT the row. So a wildcard `(*,*,*,*)` row IS reachable from a concrete key — it just scores 0. The caller's `getCachedNumberRequired` throws on `undefined` only if NO row matches at any tier.

**Concrete answer to Concern A:** outcome #1 ships today (hierarchical fallback to wildcard). For B72-era levers at `(*,*,*,*)` scope, a crypto caller passing `assetClass: 'crypto_spot'` resolves to the wildcard row with score 0 — and so does an xStock caller passing `'xstock_spot'`. Both classes silently inherit the wildcard value.

**That IS exactly the silent-fallback footgun this batch exists to remove for the affected levers** — not "in disguise" but in plain sight, just behind a different abstraction layer than STORAGE's. The fix per §11 NO-SILENT-FALLBACK doctrine: outcome #3 (explicit per-class rows, retire wildcards for the affected levers).

**Distinction worth surfacing:** the resolver's wildcard-row support is correctly documented as legitimate scope-resolution behavior for cases where a lever is genuinely cross-class (math constants, infrastructure parameters). For those, wildcard rows stay. The fix applies only to levers where wildcard-as-default-for-all-classes WAS the bug — which for B72's MCE-adjacent rows means `dbs_calculation` and `cost_model`. Other wildcard rows in `regime_classifier` + `regime_age` remain wildcard UNTIL pre-audit (Step 2) identifies them as asset-class-sensitive (per §9 question (e) heuristic).

**Onboarding-workflow §3.3 implication:** add a new learnings entry at this batch's completion report: "Layer 2 `module_constants` levers at `(*,*,*,*)` wildcard scope serving multiple asset classes are silent-fallback footguns from the per-class-awareness lens. The resolver's wildcard support is correct as a feature; the data shape is what makes specific levers buggy. Fix at the data layer (explicit per-class rows + retire wildcard), not the resolver layer."

---

## §2.6 — Atomicity rule (rev2 — Langston cross-cutting note 1)

§3.4 resolver-key tightening + §3.5 seed migration MUST ship in the same commit. Resolver-tightening before seed = xStock crypto inheritance breaks immediately on first cycle but no xStock row exists yet → hard-fail on every xStock cycle for the deploy window. Seed before resolver-tightening = harmless prep but inverts deploy ordering risk and leaves the wildcard rows live for an interim. Atomic pair eliminates both windows.

**Implementation:** the migration file ships in the same commit as the resolver-key code edits. Boot order on Hetzner: PM2 restart → migration runs → resolver consults new rows from first cycle. No race window.

---

## §2.7 — B-PHASE-A2 interaction guarantee (rev4 NEW — pre-audit v2 §1.4)

B-PHASE-A2 shipped 2026-05-17 (4 days ago at scope rev4 draft time). It added a NEW xStock-specific `DirectionalBiasStore` singleton instance with `mode='xstock'` semantics (sector partition + dual floor). Currently active in production via the VTS shadow path.

**B79.0n.MCE rev4 GUARANTEES:**

1. **No disruption to B-PHASE-A2 stored singletons.** The crypto + xStock `DirectionalBiasStore` instances continue operating with their constructor-option-based per-class resolution. This batch's seed migration adds rows under `(module_name='dbs_calculation', constant_name='min_sample_count')` that the stores already correctly resolve via `getCachedNumberRequired` with per-class `assetClass`.

2. **`sector_coverage_floor` row preserved.** B-PHASE-A2's xstock-only `(module_name='dbs_calculation', asset_class='xstock_spot', constant_name='sector_coverage_floor')` row is at explicit `xstock_spot` scope already. This batch's migration WHERE clause MUST scope by `constant_name = 'min_sample_count'` only — verified in §3.5 SQL template. Other `dbs_calculation` constants stay untouched.

3. **Crypto behavior byte-identical pre/post.** Today crypto store reads `min_sample_count` with `assetClass='crypto_spot'` → resolver falls through wildcard `(*,*,*,*)` → returns 20. Post-batch: resolver finds explicit `crypto_spot` row → returns 20. Same value, different resolution path. xStock identical.

4. **Migration semantics scope verified.** EXISTS-gated DELETE in §3.5 Step 3 only fires when both crypto_spot + xstock_spot replacement rows are confirmed present, so the `sector_coverage_floor` xstock row CANNOT be accidentally retired (different `constant_name`, different EXISTS predicate).

**Step 7 verification gate addendum:** post-deploy assertion includes "`SELECT COUNT(*) FROM module_constants WHERE module_name='dbs_calculation' AND constant_name='sector_coverage_floor' AND asset_class='xstock_spot'` returns 1" — protects the B-PHASE-A2 row.

---

## §3 — Code changes

Concrete file:line modifications. Pre-audit (Step 2) will expand the caller-site enumeration via compile-driven audit; this section captures the load-bearing surface API changes.

### §3.1 — `server/core/metrics/market-regime.ts`

**Before** (line 209-216):
```ts
export function calculatePairRegime(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,
  macroModifier: number,
  regimeConfig: RegimeConfig,
  assetClass: string = 'crypto_spot',
): RegimeCalculationResult {
```

**After:**
```ts
export function calculatePairRegime(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,
  macroModifier: number,
  regimeConfig: RegimeConfig,
  assetClass: AssetClass,  // REQUIRED per B79.0n.MCE — no silent default
): RegimeCalculationResult {
```

Import `AssetClass` type from `shared/asset-classes.ts`. TypeScript will compile-fail every caller that doesn't pass `assetClass`. Each caller updated to pass either an explicit `'crypto_spot' as const` (crypto-intentional paths like fx5-scanner-driven MCE invocations) or the per-cycle `assetClass` (xStock-aware paths like VTS scanner shadow).

### §3.2 — `server/services/market-context-engine.ts`

`calculateMarketContext(symbol, ohlcData, assetClass?)` → REQUIRED `assetClass: AssetClass`. Internal singleton state (`MarketContextCache`) gains `assetClass` as a cache-key component to prevent cross-class cache pollution at the symbol level (cache key extends from `${symbol}` to `${symbol}:${assetClass}` — same pattern STORAGE used for SQE cache).

Pre-audit will enumerate all callers; expect 4-6 sites (VTS scanner shadow path, signal-orchestrator MCE warmup, vts-runner, and possibly fx5-scanner).

### §3.3 — `server/core/math/cost-model.ts` (3 surfaces)

**Before** (line 61):
```ts
export function getFrictionForAssetClass(assetClass: string = 'crypto_spot'): AssetClassFrictionModel {
  switch (assetClass) {
    case 'crypto_spot': return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot': return XSTOCK_SPOT_FRICTION;
    default:
      if (!_unknownAssetClassWarned) {
        console.warn(`[B79][cost-model] unknown assetClass=${assetClass}; falling back to crypto_spot friction (warn-once)`);
        _unknownAssetClassWarned = true;
      }
      return CRYPTO_SPOT_FRICTION;
  }
}
```

**After:**
```ts
export function getFrictionForAssetClass(assetClass: AssetClass): AssetClassFrictionModel {
  switch (assetClass) {
    case 'crypto_spot': return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot': return XSTOCK_SPOT_FRICTION;
    case 'crypto_perp':
    case 'xstock_perp':
      throw new Error(`[B79.0n.MCE][cost-model] assetClass=${assetClass} has no friction model wired yet — file as RUNNING_ISSUES + add to scope before consuming`);
    default: {
      const _exhaustive: never = assetClass;
      throw new Error(`[B79.0n.MCE][cost-model] unreachable assetClass=${_exhaustive}`);
    }
  }
}
```

Same pattern for `getDefaultCostComponentsForAssetClass` (line 82) and `getCachedCostMetrics` (line 111) — REQUIRED `AssetClass` + exhaustive switch + fail-hard on perp paths until those friction models are wired. The warn-once-fallback mechanism + `_unknownAssetClassWarned` flag are removed entirely (NO PATCHES doctrine — fail-hard, don't silently degrade).

**Note on `crypto_perp` + `xstock_perp` fail-hard:** today no consumer reaches these branches (no perp signals are routed through cost-model). The fail-hard is a deliberate forcing function: when perpetual futures onboarding begins, the throw makes the next required piece of work immediately visible. Per Kyle's CLAUDE.md §11 "fail hard if the DB is empty — don't silently use a default."

### §3.4 — Resolver-key tightening at MCE-adjacent sites (rev4 — pre-audit v2 corrections applied)

| File:line | Lever module | Current resolver | Proposed | Status |
|---|---|---|---|---|
| ~~`directional-bias-store.ts:59`~~ | `dbs_calculation.min_sample_count` | `{ ..., assetClass: assetClass }` (already per-class) | **NO CODE CHANGE NEEDED** | **DROPPED rev4** — B-PHASE-A2 (2026-05-17) already shipped per-class resolution. Seed migration §3.5 still removes wildcard fall-through. |
| ~~`cost-metrics.ts:34`~~ | ~~`cost_model.default_avg_return`~~ | n/a (file deleted) | **FILE DELETED rev5** — Langston Q-VI option (a). Orphan dead-code chain (`getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor`) deleted entirely with the file. `cost_model.default_avg_return` row drops out of §3.5 migration. | **rev5 NEW** — see §3.4.1 below for deletion details. |
| `regime-age-factor.ts:150` | `regime_age.momentum_floor_path_a` | `{ ..., assetClass: '*' }` | **KEEP WILDCARD** (pure math threshold, cross-class invariant) | UNCHANGED — pre-audit v1 §4.1 decision confirmed in v2 §0.5. |
| `adaptive-goals-weight.ts:27` | `goals_weighting.ai_weight_cap` | `{ ..., assetClass: '*' }` | **KEEP WILDCARD** (governance cap, uniform across classes) | UNCHANGED — pre-audit v1 §4.2 decision confirmed in v2 §0.5. |

Sites flagged "VERIFY IN PRE-AUDIT" require a concrete read of the module's semantic to decide. If the lever is genuinely shared, wildcard stays + inline comment explains why. Pre-audit Step 2 reports decisions before implementation.

**(rev2) Atomicity:** the resolver-key tightening edits here MUST ship in the same commit as §3.5 seed migration per §2.6. No deploy of resolver-tightening without the migration in the same release artifact.

### §3.4.1 — Dead-code cleanup deliverable (rev5 NEW — Langston Q-VI option (a))

**File to delete:** `server/core/metrics/cost-metrics.ts` (entire file — orphan from Directive 11.3A era).

**Functions removed:**
- `getDefaultAvgReturn()` (module-private)
- `updateCostData()` (exported, only test-consumed)
- `getTransactionCostFactor()` (exported, only test-consumed)
- `getCachedSpread()` / `updateSpreadCache()` / `getCostCache()` / `clearCostCache()` (potentially consumed — verify in Step 3 grep before deletion)
- `computeMarketFriction()` / `describeFriction()` / `mapFrictionVisual()` / `getAdaptiveFrictionTier()` / `logPairFrictionAudit()` / `formatFrictionDisplay()` / `getCachedFrictionBands()` / `computeAdaptiveFrictionBands()` (Directive 11.4A/B/H friction visualization — check at Step 3 whether these have live consumers; if YES, move to a new home; if NO, delete with the file)

**Step 3 grep gate (before deletion):** `grep -r 'from.*cost-metrics' server/` to enumerate all consumers. Test files consume them — those test files either get deleted (if exclusively dead-chain-exercising) or refactored (if exercising live logic incidentally). Per Langston Step 2 ACK: if (2) refactor turns out >50 lines, surface back to Langston for option (b) defer.

**Test dependency disposition (Langston Q-VI gate):** `dynamic_sizing.test.ts:283` calls `updateCostData('BTC/USD', spread, slippage, avgReturn)`. Step 3 reports either:
- "Test exclusively exercises dead chain — DELETED in same commit"
- "Test exercises live dynamic-sizing logic — REFACTORED to use cost-cache.ts directly without going through dead chain (N lines diff)"

**B72 warmup stub at `server/startup/b72-warmup.ts:43`** lists `'cost_model'` in PREFETCH_MODULES. Verify post-cleanup whether other consumers of `cost_model` module exist (likely `cost-model.ts` itself via `getFrictionForAssetClass`-adjacent constants). If `cost_model.default_avg_return` becomes the only remaining `cost_model.*` constant after seeing the codebase, the row itself becomes orphaned. **Decision at Step 3:** if no other `cost_model.*` consumers, delete the `default_avg_return` row instead of leaving it as a stale module_constants entry. Update b72-warmup.ts PREFETCH_MODULES accordingly. Report in Step 3 diff.

**`shared` schema cleanup:** verify `CostData` interface, `FrictionStatus` interface, `FrictionTier` type, `FrictionVisual` interface are not consumed elsewhere. If only by cost-metrics.ts itself, delete with the file.

### §3.5 — Seed migration (rev2 — outcome #3: per-class rows + wildcard retirement)

**File (rev5):** `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class.sql` (cost dropped from name per Q-VI(a)).

**Per Concern A resolution (§2.5 above), the migration ships outcome #3** — for each lever in `dbs_calculation` + `cost_model` currently consumed at wildcard `(*,*,*,*)` scope and read by the resolver-key tightening sites in §3.4, the migration:

1. **Adds explicit `crypto_spot`-scoped row** mirroring the current wildcard value byte-for-byte (preserves crypto behavior — crypto-by-construction-NONE invariant).
2. **Adds explicit `xstock_spot`-scoped row** with the same placeholder-cloned value (Phase 19 calibration replaces with measured xStock parameters).
3. **Retires the wildcard row** via conditional DELETE that fires only after both class-scoped rows are confirmed present (no orphan period).

**rev5 final SQL** (wrapped in BEGIN/COMMIT per Langston C1 atomicity; scoped to `dbs_calculation.min_sample_count` per Q-VI(a)):

```sql
BEGIN;

-- Step 1: add crypto_spot row (byte-identical to current wildcard value 20)
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, set_by)
SELECT module_name, exchange, 'crypto_spot' AS asset_class, strategy, regime, constant_name, value, 'b79-0n-mce-step3'
FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND asset_class = '*'
  AND constant_name = 'min_sample_count'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Step 2: add xstock_spot row (placeholder-clone of crypto value 20; Phase 19 calibration replaces)
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, set_by)
SELECT module_name, exchange, 'xstock_spot' AS asset_class, strategy, regime, constant_name, value, 'b79-0n-mce-step3'
FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND asset_class = '*'
  AND constant_name = 'min_sample_count'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Step 3: retire wildcard row (only after both class-scoped rows confirmed present)
DELETE FROM module_constants w
WHERE w.module_name = 'dbs_calculation'
  AND w.asset_class = '*'
  AND w.constant_name = 'min_sample_count'
  AND EXISTS (
    SELECT 1 FROM module_constants r
    WHERE r.module_name = w.module_name
      AND r.asset_class = 'crypto_spot'
      AND r.constant_name = w.constant_name
      AND r.strategy = w.strategy
      AND r.regime = w.regime
  )
  AND EXISTS (
    SELECT 1 FROM module_constants r
    WHERE r.module_name = w.module_name
      AND r.asset_class = 'xstock_spot'
      AND r.constant_name = w.constant_name
      AND r.strategy = w.strategy
      AND r.regime = w.regime
  );

COMMIT;
```

**Critical safety properties (rev5):**
- WHERE clause scoped to `constant_name = 'min_sample_count'` — protects B-PHASE-A2's `sector_coverage_floor` xstock_spot row from being collaterally retired (per Langston C1).
- `EXISTS`-gated DELETE — no orphan window where wildcard is gone but class-scoped rows not yet present.
- Idempotent — re-runs are no-ops after first successful pass.
- Atomic in single transaction — partial failure rolls back fully.

**Idempotency:** ON CONFLICT DO NOTHING on inserts + EXISTS-conditional DELETE means re-running the migration is a no-op after the first successful pass.

**Pre-audit Step 2 fills in the `constant_name` list** by enumerating which exact constants are consumed at each of the 4 resolver-tightening sites (§3.4). Initial estimate: `dbs_calculation.min_sample_count` + likely 1-3 `cost_model` constants → 2-4 distinct constants → 4-8 wildcards retired + 8-16 explicit rows added. Pre-audit gives exact count.

**rev3 — pre-audit RESOLVED the constant_name list:** exactly 2 constants:
- `dbs_calculation.min_sample_count` (current wildcard value: `20`, `exchange='*'`)
- ~~`cost_model.default_avg_return` (current wildcard value: `0.005`, `exchange='*'`)~~ **DROPPED rev5** — dead-code consumer deleted per Langston Q-VI(a).

**rev5 final constant_name list:** exactly 1 constant — `dbs_calculation.min_sample_count`.

Net row delta: **+1** (1 wildcard retired + 2 class-scoped rows added = +1). Step 7 verification SQL in pre-audit §2 is the authoritative gate.

**rev3 atomicity wrap (C1):**

```sql
BEGIN;
-- [Step 1] add crypto_spot rows
-- [Step 2] add xstock_spot rows
-- [Step 3] retire wildcards (EXISTS-gated)
COMMIT;
```

**Rollback SQL stub** (prepared at Step 5 push, executable if Step 7 verification fails) — **rev5: 1 wildcard + 2 rows only** (cost_model dropped):

```sql
BEGIN;
-- Re-insert wildcard (1 row)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, set_by)
VALUES ('dbs_calculation', '*', '*', '*', '*', 'min_sample_count', '20'::jsonb, 'b79-0n-mce-rollback')
ON CONFLICT DO NOTHING;
-- Remove class-scoped rows (2 rows)
DELETE FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND constant_name = 'min_sample_count'
  AND asset_class IN ('crypto_spot', 'xstock_spot');
COMMIT;
```

Rollback stub stored alongside the forward migration as `2026-05-22-b79-0n-mce-dbs-per-class-rollback.sql` — not auto-run by deploy, available for manual execution if Step 7 SQL gate fails post-deploy.

**Scope discipline:** xStock `regime_classifier` + `regime_age` rows NOT touched this batch — kept at wildcard scope until pre-audit's TFS-desat-per-class analysis (per §9 (e) heuristic) decides whether they qualify for per-class seed or stay shared. If pre-audit identifies any of those wildcard rows as asset-class-sensitive, defer per-class seed to SCORING (#8) — same handoff pattern STORAGE used for `module_constants.sqe_config`.

**rev3 — TFS desat NULL finding (Q-III RESOLVED):** pre-audit confirmed TFS desat fields do NOT exist in `module_constants` — they live inline in `market-regime.ts:69-82` `DEFAULT_REGIME_CONFIG`. B78's xstock branch in `regime-thresholds.ts` already provides code-level per-class TFS desat. No `regime_classifier` migration rows. The §9(e) heuristic question is null. Completion report logs the nullification so future auditors don't re-open the question.

---

## §3.7 — Indicator bar-interval invariant (rev3 — Q-I RESOLVED)

**Investigation outcome (full trace in pre-audit §6):**

| Pipeline | OHLC source | Bar interval |
|---|---|---|
| Crypto MCE (`signal-orchestrator.ts:1303`) | `ohlcCache.getOHLCData(symbol, 60)` from Kraken REST | **60-min** |
| xStock MCE (`xstock_spot/eval-cycle.ts:335,717`) | `xstock-ohlc-cache.ts:132-135` aggregating from `xstock_spot_ohlc_1m` | **60-min** |
| VTS shadow path (`vts-runner.ts:773-777`) | `ohlcCache.getOHLCData(symbol, 60)` | **60-min** |
| B-PHASE-A2 backfill (`scripts/b-phase-a2-backfill.ts:7-8,82-88`) | 1-min source aggregated to 60-min buckets | **60-min** |

**Critical fact:** all 4 MCE-feed paths consume 60-min OHLC bars. Hardcoded indicator lookbacks (`ATR period=14`, `ADX period=14`, `Momentum lookback=30` at `market-regime.ts:104-162`) produce INVARIANT wall-clock durations across crypto + xStock:
- 14 bars × 60-min = **14 hours** (ATR/ADX)
- 30 bars × 60-min = **30 hours** (Momentum)

**Decision per Langston gate path #2:** keep hardcoded lookbacks; add inline comment documenting the bar-interval invariant; fix stale `15-min` reference in `market-regime.ts:255` to `60-min` (crypto pipeline upgraded at some prior batch but the comment didn't follow).

**Inline comment to add at `market-regime.ts:104` (above `computeMomentum`):**

```ts
// B79.0n.MCE invariant (2026-05-21): all MCE-fed pipelines (crypto + xstock_spot
// + VTS shadow) consume 60-min OHLC bars. Hardcoded lookbacks below produce
// invariant wall-clock durations across asset classes:
//   ATR/ADX 14-bar period × 60-min = 14 hours
//   Momentum 30-bar lookback × 60-min = 30 hours
// If a future asset class introduces a non-60-min bar interval (e.g. 1-min ticks,
// 5-min FX bars), this assumption breaks and per-class lookback constants migrate
// to module_constants.indicator_window or equivalent. Until then, wildcard scope
// is correct and class-invariant.
```

**Stale-comment-fix at `market-regime.ts:255`:** change `"30 candles at 15-min = 7.5hr"` text to `"30 candles at 60-min = 30hr; signal orchestrator and xStock both feed 60-min bars per B79.0n.MCE invariant"`.

**No indicator-per-class work in this batch.** Closes §6.2 of pre-audit + §9(f) of rev2 scope.

---

## §3.8 — Ablation path fixes (rev3 — Q-II APPROVED in-batch)

Two ablation paths today read `DEFAULT_REGIME_CONFIG` without threading the cycle's `assetClass`:

| File:line | Current shape | Fix |
|---|---|---|
| `server/core/metrics/regime-age-factor.ts:140` | `calculatePairRegime(ohlcData, dbs, slope, macro, DEFAULT_REGIME_CONFIG)` — silently uses crypto-tuned defaults | Thread cycle's `assetClass`: `calculatePairRegime(ohlcData, dbs, slope, macro, regimeConfigFor(assetClass), assetClass)` where `regimeConfigFor` picks the per-class RegimeConfig (already present per B78). |
| `server/core/metrics/multi-tf-agreement.ts:135` | same pattern: `calculatePairRegime(ohlcData, ..., DEFAULT_REGIME_CONFIG)` — no class threading | Same fix — thread cycle's `assetClass`. |

**Per Langston Step 2 ACK:** small touch, large Phase 19 surprise reduction, zero scope-creep beyond MCE's existing scope. NEW unit test added to §4 #6 validates xStock signal traversing these paths picks up xstock_spot config rather than crypto DEFAULT_REGIME_CONFIG.

### §3.6 — Caller-site updates (rev3 — pre-audit confirmed 27 sites; per-site dispositions resolved)

Compile-driven audit at implementation (Step 3) surfaces every caller of:
- `calculatePairRegime` — 6 production callers (pre-audit §3.1)
- `MarketContextEngine.computeContext()` — actual entry function name (scope §3.2 originally said `calculateMarketContext`; no standalone function by that name; the surface is the singleton's method)
- `getFrictionForAssetClass` — 0 direct callers (internal-only)
- `getDefaultCostComponentsForAssetClass` — 0 direct callers (internal-only)
- `getCachedCostMetrics` — 9 production callers (ACTIVE FOOTGUN — all 9 today pass only `symbol`)

Each site labeled (a) crypto-intentional explicit `'crypto_spot' as const`, (c) asset-class-aware via cycle context, or **(n/a) NOT subject to REQUIRED-AssetClass refactor** (reads non-computeContext MCE methods that don't take assetClass).

**Per-site dispositions for the 5 (d) INVESTIGATION rows (rev3 — Q-IV resolved):**

| File:line | MCE method called | Disposition | Justification |
|---|---|---|---|
| `market-indicators.ts:260` | `mce.getDominantRegime()` + `mce.getCachedVolumes()` (later `mce.computeGlobalBias(volumes)` at :309) | **(n/a)** | Global-aggregator methods read across the entire MCE cache; no per-symbol/per-class arg. Pre-audit incorrectly grouped this with `computeContext` callers. NOT subject to REQUIRED-AssetClass refactor at this site. |
| `market-indicators.ts:306` | same as :260 — `mce.getCachedVolumes()` + `mce.computeGlobalBias(volumes)` | **(n/a)** | Same global-aggregator pattern. |
| `paper-execution-engine.ts:1369` | `mce.getCurrentOutcomeFeedbackConfig()` | **(a) class-agnostic infra** | Returns the cached OutcomeFeedbackConfig; method takes no assetClass arg. Config object is system-wide, not per-symbol. Inline comment: `// OutcomeFeedbackConfig is system-wide MCE-state introspection, not per-symbol routing — no assetClass arg.` |
| `paper-execution-engine.ts:2021` | `mce.getCachedContext(signal.symbol)` + `mce.getCurrentMacroContext()` + `mce.getCurrentPhaseWeights()` | **(c) cycle-context** | `getCachedContext(symbol)` reads MCE's per-symbol cache. **If MCE cache extends to `${symbol}:${assetClass}` per §3.2, this caller MUST pass the signal's assetClass.** Threading via `signal.metadata?.assetClass ?? resolveAssetClass(signal.symbol, 'kraken')` per STORAGE pattern. `getCurrentMacroContext` + `getCurrentPhaseWeights` are global — (n/a) within this same site. |
| `vts-service.ts:921` | `mce.getCurrentOutcomeFeedbackConfig()` | **(a) class-agnostic infra** | Same as paper-execution-engine.ts:1369 — config introspection, no assetClass arg. |

**Net per-site (d) row outcome:** 1 site needs (c) cycle-context threading, 2 sites need (a) inline-comment marking class-agnostic, 2 sites are (n/a) (not refactor targets at all). This refines the pre-audit's "18 MCE callers" claim down to ~8-10 sites that ACTUALLY need REQUIRED-AssetClass touch (the `computeContext` callers from signal-orchestrator + vts-runner + xstock_spot/eval-cycle).

**rev3 ask for Langston:** broader `getCachedContext` enumeration. Per §3.2 cache-key extension, ALL `getCachedContext(symbol)` callers need updating to `getCachedContext(symbol, assetClass)`. Compile-driven Step 3 audit surfaces the full set; current known caller count = 1 (`paper-execution-engine.ts:2021`). Likely 3-5 total across the codebase.

**Atomicity (rev2):** the resolver-key tightening edits here MUST ship in the same commit as §3.5 seed migration per §2.6. No deploy of resolver-tightening without the migration in the same release artifact.

---

## §4 — Unit tests

1. **REQUIRED-`assetClass` TYPE LOCK** — `server/tests/unit/b79-0n-mce-required-assetclass.test.ts`. Three `@ts-expect-error` regression locks: `calculatePairRegime` / `calculateMarketContext` / `getFrictionForAssetClass` called without `assetClass` MUST be a compile error. Same pattern STORAGE used.

2. **Cost-model fail-hard on perp paths** — explicit assertion that `getFrictionForAssetClass('crypto_perp')` throws with the specific RUNNING_ISSUES-pointing error message. Prevents silent re-introduction of warn-once-fallback later.

3. **MCE cache isolation by `(symbol, assetClass)`** — `b79-0n-mce-cache-isolation.test.ts`. Warm cache with `(BTC/USD, crypto_spot)` then read with `(BTC/USD, xstock_spot)` (hypothetical — wouldn't happen in practice but tests the cache-key extension). Assert 2 distinct internal calls. Same pattern as STORAGE's SQE cache-isolation test.

4. **xstock_spot regime path uses xstock thresholds** — `b79-0n-mce-xstock-regime-routing.test.ts`. Synthesize OHLC data, call `calculatePairRegime(..., 'xstock_spot')`, assert returned regime corresponds to xStock threshold evaluation (not crypto). This is a regression-lock for B78's xstock branch staying wired post-refactor.

5. **Resolver-key tightening integration** — for each site where `'*'` becomes `assetClass: input.assetClass`, a unit test that warms 2 distinct asset-class rows in test DB + asserts that the per-class lookup returns the per-class value, not the wildcard.

6. **(rev3 — Q-II) Ablation path asset-class threading** — `b79-0n-mce-ablation-path-assetclass.test.ts`. Synthesize an xStock signal, drive it through `regime-age-factor.ts:140` AND `multi-tf-agreement.ts:135` re-classification paths, assert returned regime corresponds to xStock-threshold evaluation (consumes B78's xstock branch from `regime-thresholds.ts`) — NOT crypto's `DEFAULT_REGIME_CONFIG` values. Regression-lock against silent crypto-config inheritance through ablation pathways.

---

## §5 — Acceptance criteria

### §5.1 — Build + CI

All 4 GitHub Actions checks green: TypeScript Check, Test Suite, Build, Docker Build. No new test failures.

### §5.2 — Step 7 verification gates

1. `mce-required-assetclass.test.ts` — passes (3 `@ts-expect-error` cases).
2. `mce-cache-isolation.test.ts` — passes.
3. `mce-xstock-regime-routing.test.ts` — passes (B78 xstock thresholds wired correctly post-refactor).
4. Cost-model perp fail-hard test — passes.
5. xStock scanner shadow path continues computing MCE per cycle on staging (PM2 logs grep for `[MCE][cycle]` lines tagged with `assetClass: 'xstock_spot'`).
6. `screener_filters` row count unchanged (24 crypto + 24 xStock from STORAGE) — this batch doesn't touch screener_filters.
7. **(rev5 — Q-VI(a) updated from rev3 +2 → +1)** `module_constants` row count: net **+1** (1 constant × +1 = +1). Composition shifts from 1 `(*,*,*,*)` wildcard to 2 explicit `crypto_spot` + `xstock_spot` rows for `dbs_calculation.min_sample_count`. Step 7 verifies (a) the retired wildcard has both crypto + xStock replacement rows, (b) crypto row byte-identical to former wildcard value (`20`), (c) no wildcard row remains for `dbs_calculation.min_sample_count`. **rev5 NEW assertion (per Langston C1):** `SELECT COUNT(*) FROM module_constants WHERE module_name='dbs_calculation' AND constant_name='sector_coverage_floor' AND asset_class='xstock_spot'` returns **1** (B-PHASE-A2's row protected — must not be collaterally retired).

8. **(rev5 — Q-VI(a) updated from rev3 N≥4 → N≥2)** PM2 boot log contains: `[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows for asset_class=crypto_spot+xstock_spot (modules: dbs_calculation)` where N ≥ 2 (1 crypto_spot + 1 xstock_spot for `min_sample_count`). Emitted from MCE's first cache-refresh cycle post-boot. Step 8 verification looks for this positive signal (absence indicates cache didn't pick up new rows — escalates to investigation).

9. **(rev5 NEW — Q-VI(a) dead-code disposition)** Step 7 verifies `server/core/metrics/cost-metrics.ts` is deleted from the filesystem (or at minimum the dead chain `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` removed). Test files referencing those functions are either deleted (if exclusively dead-chain-exercising) or refactored to use `cost-cache.ts` directly. Step 3 disposition report MUST be included in the PR description.

### §5.3 — Crypto regression-lock (umbrella §2.2)

24h pre-deploy / 24h post-deploy comparison per the per-metric thresholds:

| Metric | Threshold | Window |
|---|---|---|
| FX5 pool size | ±5% | 24h |
| Signal generation rate | ±5% | 24h |
| VTS trade rate | ±5% | 24h |
| Active trade-open rate | ±1-2 trades/day OR ±15% 7d rolling | 7-day rolling |

Same scheduled-alert handoff STORAGE used: a new alert created at deploy + fires 24h later.

**(rev2) Soak-baseline timing per Langston cross-cutting note 3:** MCE deploy targeted at **≥2026-05-22T12:00Z** so the pre-deploy 24h baseline window sits fully post-STORAGE/UD/HYGIENE stabilization (the same-day 2026-05-21 ~11:55Z trio of deploys). If MCE deploys earlier than 2026-05-22T12:00Z, baseline window will partially overlap STORAGE/UD/HYGIENE deploy turbulence; document in completion report as partial-overlap if unavoidable.

### §5.4 — Step 8 Langston second-pass

Independent UI verification via Claude-in-Chrome on staging: navigate xStocks tab + Filter Diagnostics, confirm MCE-side fields render the xStock branch values (regime_classifier xstock thresholds visible in the diagnostics surface, not crypto's). Confirm cost-model surfaces consume xStock friction when MCE is invoked on an xStock symbol.

---

## §6 — Crypto-by-construction-NONE invariant

Every code change in this arc must be either ADDITIVE (adds asset-class branch; crypto path unchanged at runtime) or TYPE-ENFORCED with explicit crypto callers updated to pass `'crypto_spot' as const` (semantically identical to today's silent default).

**Proof for this batch:**
- `calculatePairRegime` silent default removed; every existing caller that hit the silent default is updated to pass `'crypto_spot' as const`. The xStock branch at line 227 is **already wired** by B78 — this batch removes the silent default, not the branch logic. Crypto path execution: byte-for-byte identical.
- `cost-model.getFrictionForAssetClass` silent default removed; same pattern. The warn-once-fallback for unknown asset classes was never reachable in production today (every caller passes a real asset_class string), so removing it is a no-op at runtime for crypto.
- Resolver-key tightening at 4 sites: `'*'` → `assetClass: input.assetClass` is semantically equivalent for crypto when xStock isn't routing through (only the xStock path reads the new per-class row). Crypto rows under wildcard scope remain primary for crypto callers.
- Seed migration adds xStock rows ONLY; crypto rows untouched.
- MCE cache key extension `${symbol}` → `${symbol}:${assetClass}`: crypto symbols (BTC/USD, ETH/USD, etc.) cache key becomes `BTC/USD:crypto_spot` — different string but cache content identical to today's `BTC/USD` entry. **Pre-audit verifies no cross-symbol cache contention emerges** (xStock and crypto symbols don't collide in the symbol namespace today; the cache-key extension is defense-in-depth, not bug-fix).

---

## §7 — Deferred follow-ups (filed at governance close)

1. **RUNNING_ISSUES #115 — `dbs_calculation` module per-class calibration.** Wildcard placeholder-clone retained at this batch; promote to per-class calibration when (a) Phase 19 xStock active-trading enablement gate approaches, OR (b) Step 7 xStock signal generation rate materially differs from crypto suggesting per-class `min_sample_count` needed. Origin: umbrella §1.5 row "MCE" reference.

2. **RUNNING_ISSUES #123 — External macro feed per-class signal.** `external-macro-feed.ts` is class-agnostic today (CoinGecko global + Binance perps funding — crypto-relevant macro only). xStock-relevant macro (rates, earnings calendar, equity index regime) differs structurally. Post-umbrella B79.x follow-up. Origin: Langston v1 item 13 + umbrella §5.5.

3. **TFS desat fields per-class scope.** If pre-audit identifies that B72's wildcard `regime_classifier` TFS desat rows (B67.3.5 era, 5 fields) are asset-class-meaningful for xStock, defer per-class seed to SCORING (#8) with explicit promote-to-active triggers documented (same STORAGE → SCORING handoff pattern). If pre-audit confirms they are math constants (e.g., MACD line, TFS slope formula coefficients), wildcard stays.

4. **`module_constants.cost_model` per-class lever calibration.** This batch placeholder-clones xStock from crypto. Phase 19 calibration replaces with measured xStock cost parameters when active-trade fill data accumulates.

5. **MCE cache eviction policy for asset-class dimension.** Pre-audit verifies whether the cache's existing eviction policy needs to consider asset-class isolation. If asset-class strings stay finite (4 today, ≤10 long-term), the dimension is bounded and current LRU/TTL policy works.

---

## §8 — Asset-class onboarding workflow learnings (placeholder per CLAUDE.md §3.3)

Fills during completion report (Step 11). Empty section acceptable if no new learnings surface; explicit "No new onboarding learnings this batch" required in that case — no filler.

Specific learnings anticipated based on STORAGE → MCE handoff:
- **REQUIRED-`assetClass` pattern at API surfaces:** does the STORAGE pattern transfer cleanly to MCE's three surface APIs, or does MCE expose a different shape (e.g., the singleton + cache combination) that needs a variant pattern? Document for ASSET_CLASS_ONBOARDING_WORKFLOW Step 4.9 evolution.
- **Cache-key extension at compute-side singletons:** STORAGE extended the SQE service's `${mode}` cache key to `${mode}:${assetClass}`. MCE extends `${symbol}` to `${symbol}:${assetClass}`. Both are "primary identifier + asset-class dimension" — generalize as a pattern for future compute-side caches.
- **Fail-hard exhaustive switch for asset_class enum branching:** the `default: { const _exhaustive: never = assetClass; throw ... }` pattern is canonical TypeScript for exhaustiveness checking. Document in ASSET_CLASS_ONBOARDING_WORKFLOW as a recipe vs the warn-once-fallback anti-pattern.

---

## §9 — Open questions for Langston (Step 1 ACK gate)

(a) **Resolver-key tightening — verify sites:** I've named 4 wildcard sites (directional-bias-store:59, cost-metrics:35, regime-age-factor:150, adaptive-goals-weight:27). The first two are "tighten in this batch"; the latter two are "VERIFY IN PRE-AUDIT — likely stays wildcard." Do you want me to commit to a decision at scope time, or is pre-audit-driven decision acceptable?

(b) **`crypto_perp` + `xstock_perp` fail-hard in cost-model:** I'm proposing a deliberate throw on those branches as a forcing function for perpetual futures onboarding. Acceptable, or do you want a softer placeholder (e.g., neutral 0-friction fallback)?

(c) **MCE singleton cache-key extension:** `${symbol}` → `${symbol}:${assetClass}`. Defense-in-depth or bug-fix? Pre-audit will check whether xStock and crypto symbol namespaces overlap today (BTC/USD vs AAPLx... no obvious collision, but verify). If overlap exists, this is a real bug-fix; if not, defense-in-depth.

(d) **#115 and #123 RUNNING_ISSUES filing:** these are umbrella-doc references today, not actual entries in `RUNNING_ISSUES.md`. I plan to file them at this batch's governance close (Step 10). Number assignments: confirm I should use #115 + #123 verbatim (matches umbrella references), or do you want me to assign next-available numbers and cross-reference?

(e) **TFS desat per-class concern:** the 5 wildcard `regime_classifier` rows from B72 are TFS desat fields. Pre-audit needs to determine whether they are math constants (wildcard stays) or asset-class-sensitive thresholds (defer per-class to SCORING). Do you have prior knowledge on which they are, or should pre-audit go in blind?

(f) **Indicator-computation enumeration:** umbrella §1.5 says "indicator computations (VWAP / ATR / EMA / BB / RSI) that aren't lever-driven" remain as MCE work. The exploration found these are scattered (no single `indicators.ts` file). Pre-audit will enumerate; if any indicator has a hardcoded asset-class-sensitive parameter, surface to you before code change. Acceptable?

(g) **Soak baseline reset for MCE:** STORAGE + UD share the alert `d4b2e590` baseline (24h pre-deploy was 2026-05-20T11:55Z). MCE's 24h soak fires 24h after MCE deploy — this will be a separate alert with a fresh baseline. Concur?

Reply: **scope v1 FINAL ACK** / **specific concerns A/B/C** / **substantive design disagreement on objective**.

---

## §9.5 — rev3 status of open questions (Step 2 dispositions folded)

| Q | Status |
|---|---|
| (a) VERIFY-IN-PRE-AUDIT decision-time | **RESOLVED** — pre-audit §4 both sites KEEP WILDCARD (math constants). |
| (b) crypto_perp/xstock_perp fail-hard | **APPROVED** in scope v1 ACK. |
| (c) MCE cache-key extension defense-in-depth | **APPROVED** in scope v1 ACK; pre-audit confirmed no symbol-namespace overlap. |
| (d) #115/#123 RUNNING_ISSUES numbering | **APPROVED** in scope v1 ACK (verify-at-governance-close + cross-reference if taken). |
| (e) TFS desat per-class | **NULL** — pre-audit §5 confirmed TFS desat lives inline in `DEFAULT_REGIME_CONFIG`, not module_constants. No migration rows. |
| (f) Indicator enumeration | **RESOLVED via §3.7** — bar-interval invariant means hardcoded lookbacks stay; inline comment + stale-comment-fix. |
| (g) Soak baseline reset for MCE | **APPROVED** in scope v1 ACK; reaffirmed in rev2 (MCE deploy ≥2026-05-22T12:00Z). |

**rev3 NEW asks for Langston** (none blocking; all "verify-at-Step-3-implementation"):

(α) `getCachedContext(symbol)` broader caller enumeration — per §3.6 (d) row 4, the cache-key extension implies ALL `getCachedContext` callers need updates. Current known: 1 site (`paper-execution-engine.ts:2021`). Step 3 compile-driven audit surfaces the full set. Concur this is implementation-driven discovery, not pre-audit-required?

(β) Rev3 acknowledgment that 4 of 5 (d) INVESTIGATION rows from pre-audit §3 are NOT actually `computeContext` callers (they read non-computeContext MCE methods). This refines the "18 MCE callers" claim down to ~8-10 actual REQUIRED-AssetClass-refactor sites. Concur on the refined count, or do you want me to re-enumerate from scratch?

(γ) Rollback SQL stub at §3.5 — stored as a sibling file, not auto-run. Pre-agreed pattern, but flagging since it adds a 2nd artifact to the Step 5 PR. Concur on sibling-file shape?

Reply: **rev3 FINAL ACK** / **decisions on α/β/γ** / **specific concerns on rev3 deltas**.

---

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §6.5.0.b: this scope file is staged in your inbox at `/home/langston/inbox/b79-0n/B79_0n_MCE_SCOPE.md`. **DO NOT `cd /mnt/gdrive` or run `git -C` against the gdrive mount — it will hang on FUSE I/O (D-state stuck processes, can't be kill -9'd; STORAGE Step 4 RE-ACK hung 10+ min before we re-dispatched).** For repo-side verification use `ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && git ...'` — staging server has same code at same commit. Embedded diff snippets above are sufficient for your review without needing to fetch additional repo content.

— Claude Code, 2026-05-21 PM (B79.0n.MCE Step 1 scope v1)
