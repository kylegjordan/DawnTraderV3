# B79.0n.STRATEGY — Scope (v1)

> **Sub-batch:** 5 of 18 in the B79.0n umbrella v4 arc.
> **Phase:** Phase 24 (multi-asset onboarding).
> **Dependencies:** STORAGE (closed 2026-05-21, commit `ab3153ce5`). MCE (closed 2026-05-22, commit `aa0564107`). UNIVERSE-DISCOVERY + HYGIENE both closed 2026-05-21.
> **Status:** v1 awaiting Langston Step 1 ACK.
> **Standing rules applied:** umbrella rev 4 §1.5 B72 prior-arc context section (§2 below) + CLAUDE.md §3.3 onboarding-learnings placeholder + §11 NO-SILENT-FALLBACK doctrine + §2.2 per-metric crypto regression-lock + §2.3 crypto-by-construction-NONE invariant + §15 NO-PATCHES.

---

## §0 — TOP-OF-REPORT mandatory disclaimers (umbrella rev 4 §9.1 + §9.2)

**🚨 THIS BATCH DOES NOT ENABLE LIVE XSTOCK ACTIVE-TRADING STRATEGY DISPATCH.** Per umbrella sequencing, xStock signals do not reach the crypto active-trading orchestrator path (`signal-orchestrator.ts → SQE → RTB → executor`) until WIRE-IN closes (sub-batch #16). xStock strategy detection continues running ONLY via the existing VTS shadow path (`xstock_spot/eval-cycle.ts` calling the shared `callStrategyDetect` dispatcher from `vts-runner.ts`), already live since B79.0j. What changes in this batch is that EVERY strategy detect method STOPS silently routing xStock callers through crypto-scoped `module_constants` wildcards; instead they route via REQUIRED `assetClass` parameters with no defaults, the same pattern STORAGE established at the screener_filters API surface and MCE just established at the regime + cost-model surface.

**🚨 NUMERIC DELTAS (PREVIOUSLY-STATED-VS-NOW):**
- Sub-batch count: still 18 (no change since umbrella rev 4).
- Strategy count: **18 canonical strategies** (9 in-class quant + 9 file-based: 8 from Directive 12.3.2 + strong_bull_trend B63 + orb B79.0d). Note: per the legacy `STRATEGIES` const in `canonical-regime-strategy-map.ts:364-382`, the count there reads as 17 because `strong_bull_trend` and `orb` are present in `STRATEGY_DISPLAY_NAMES` (lines 402-405) but missing from the older `STRATEGIES` enum. The 18-count is governance-current (CLAUDE.md persona §1).
- Detect-call-site count: **2 dispatch surfaces**, not 3 — confirmed via pre-audit grep below. Surface A = `signal-orchestrator.ts:1562-1854` (16 inline blocks for crypto active trading; `liquidity_trap` disabled at orchestrator, `orb` xstock-only). Surface B = `vts-runner.ts:callStrategyDetect()` lines 821-899 (centralized switch consumed by BOTH crypto VTS and xstock_spot/eval-cycle.ts).
- Module-constants resolver-tightening sites: estimate **20-26** (the `_SE_KEY('...')` calls in `strategy-engine.ts` lines 108, 234-235, 362-364, 474, 563-564, 649, 744, 830-831, 1043, 1186 = 14 sites; plus the 9 file-based modules' `assetClass: '*'` resolver keys; minus ORB which is already class-aware). Pre-audit will confirm exact count via compile-driven audit.
- File-based strategy modules to touch: **9** (`adaptive-flow.ts`, `defensive-hedge.ts`, `inside-bar-reversal.ts`, `morning-star.ts`, `pivot-shift.ts`, `reverse-impulse.ts`, `support-bounce.ts`, `volatility-edge.ts`, `strong-bull-trend.ts`). ORB (`orb.ts`) is the 10th file-based but is already class-aware — exemplar pattern this batch generalizes.

---

## §1 — Objective

Close the silent-default asset-class footgun at **every strategy detect surface** in the active-trading + VTS pipeline, and tighten the `_SE_KEY` resolver-key wildcards at every `module_constants.strategy.<name>` consumption site so xStock cycles stop silently inheriting crypto-scoped wildcard parameters. Plumb per-asset-class regime → strategy mapping through Directive 11.4H.6G (`strategy-mapper.ts`) and the Strategy Sync service (`strategy-sync.ts`) so that `strategy_settings` rows are scoped by `(globalContextId, mode, strategy, assetClass)` rather than the current `(globalContextId, mode, strategy)`. Update Hybrid Integration Service (`hybrid-integration.ts`) hybrid-strategy selection taxonomy so it knows about the canonical 5 hybrids + strong_bull_trend + orb (closes BUG-007 from SYSTEM_MANUAL §1851 + RISK-014 from §1878).

The gap this closes: today, any caller of any quant detect method (`detectVWAPPullback`, `detectABCDLong`, `detectSMATrendRide`, `detectBreakout`, `detectMeanReversion`, `detectRangeTrading`, `detectVWAPBounce`, `detectDHMA`) or pattern/hybrid detect method (`detectMorningStar`, `detectInsideBarReversal`, `detectSupportBounce`, `detectPivotShift`, `detectReverseImpulse`, `detectDefensiveHedge`, `detectAdaptiveFlow`, `detectVolatilityEdge`, `detectStrongBullTrend`) does NOT pass an `assetClass` parameter. Each method internally constructs its module-constants resolver key via `_SE_KEY('<strategy_name>')` which returns `{ exchange: '*', assetClass: '*', strategy, regime: '*' }` — a global wildcard. When xStock active-trading wires through `signal-orchestrator.ts` (WIRE-IN), every untouched detect call would route xStock-symbol signals through crypto-tuned wildcard `module_constants` rows. ORB is the only strategy that has already taken the class-aware shape (`assetClass: 'xstock_spot'` hardcoded at `orb.ts:171,191` + `detectORB(..., ctx?: { assetClass: string; symbol: string })` signature) — this batch generalizes that exemplar across the other 17 detect methods.

This batch does NOT calibrate per-class strategy parameters. xStock `strategy.*` lever values remain placeholder-cloned from crypto baseline at seed (where seed rows are written at all). Per-class calibration of strategy thresholds is Phase 19 active-trade work, not part of this asset-class-awareness wire-in.

---

## §2 — B72 prior-arc context (umbrella rev 4 §1.5 standing rule — mandatory)

**Reference:** umbrella rev 4 §1.5 row "STRATEGY" — **MAJOR SHRINK** because B72 + B72.2 already wired every strategy's params via the sync-read API.

### What B72 + B72.2 already did for the STRATEGY surface

| Module | Rows seeded (B72 / B72.2 ship 2026-05-05/06) | Scope | Source code consumer |
|---|---|---|---|
| `strategy.vwap_pullback` | ~14 numeric levers (pullback threshold default, volume multiplier default, ATR fractions, base confidence, etc.) | wildcard `(*, *, vwap_pullback, *)` | `strategy-engine.ts:108` (main detect) + `:1043` (helper) |
| `strategy.abcd_long` | ~13 levers + 1 string (exit_type_default) | wildcard `(*, *, abcd_long, *)` | `strategy-engine.ts:234-235` |
| `strategy.sma_trend_ride` | ~10 levers + 2 strings (entry_condition_default, exit_condition_default) | wildcard `(*, *, sma_trend_ride, *)` | `strategy-engine.ts:362-364` |
| `strategy.breakout` | ~8 levers | wildcard `(*, *, breakout, *)` | `strategy-engine.ts:474` |
| `strategy.mean_reversion` | ~10 levers + 1 string (mean_type_default) | wildcard `(*, *, mean_reversion, *)` | `strategy-engine.ts:563-564` |
| `strategy.range_trade` | ~9 levers | wildcard `(*, *, range_trade, *)` | `strategy-engine.ts:649` |
| `strategy.vwap_bounce` | ~8 levers | wildcard `(*, *, vwap_bounce, *)` | `strategy-engine.ts:744` |
| `strategy.liquidity_trap` | ~6 levers + 1 string | wildcard `(*, *, liquidity_trap, *)` | `strategy-engine.ts:830-831` (detect disabled at orchestrator/VTS) |
| `strategy.dhma` | ~10 levers | wildcard `(*, *, dhma, *)` | `strategy-engine.ts:1186` |
| `strategy.morning_star` | ~7 levers | wildcard `(*, *, morning_star, *)` | `strategies/morning-star.ts:75-76,91` |
| `strategy.inside_bar_reversal` | ~6 levers | wildcard `(*, *, inside_bar_reversal, *)` | `strategies/inside-bar-reversal.ts:72-73` |
| `strategy.support_bounce` | ~7 levers (DOUBLE-READ at lines 86-87 AND 162-163) | wildcard `(*, *, support_bounce, *)` | `strategies/support-bounce.ts:86-87,162-163` |
| `strategy.pivot_shift` | ~6 levers | wildcard `(*, *, pivot_shift, *)` | `strategies/pivot-shift.ts:70-71` |
| `strategy.reverse_impulse` | ~7 levers | wildcard `(*, *, reverse_impulse, *)` | `strategies/reverse-impulse.ts:67-68,87` |
| `strategy.defensive_hedge` | ~8 levers | wildcard `(*, *, defensive_hedge, *)` | `strategies/defensive-hedge.ts:88-89,108` |
| `strategy.adaptive_flow` | ~6 levers | wildcard `(*, *, adaptive_flow, *)` | `strategies/adaptive-flow.ts:67-68` |
| `strategy.volatility_edge` | ~6 levers | wildcard `(*, *, volatility_edge, *)` | `strategies/volatility-edge.ts:72-73` |
| `strategy.strong_bull_trend` | ~9 levers | wildcard `(*, *, strong_bull_trend, *)` | `strategies/strong-bull-trend.ts:76-77,94` |
| `strategy.orb` | ~7 levers | **EXPLICIT `xstock_spot` (B79.0d)** | `strategies/orb.ts:171,190-191` — exemplar |
| `strategy_dbs_routing_guards` | 4 rows (B72 Commit A atomic group) | per-strategy + per-asset-class | strategy-engine in-class detects |
| `strategy_gates.xstock_spot.orb` | 1 row (`enabled=true`) | per-strategy + per-asset-class | B79.0d ORB gate |
| `strategy_settings` (DB table) | rows per `(globalContextId, mode, strategy)` | **NO asset_class dimension** | `strategy-sync.ts` (synced 17 of 18 — missing `strong_bull_trend` + `orb`) + UI strategy-toggle |

**Critical distinction:** B72 wired the **API-side discipline** (sync-read via `getCachedNumbersForModule`, hard-fail on missing row inside `getCachedNumberRequired`). B72 did NOT seed per-asset-class rows for any `strategy.*` module — every row stays at wildcard scope today, EXCEPT `strategy.orb` which B79.0d shipped at explicit `xstock_spot` scope.

### What this sub-batch picks up vs what stays deferred

| Module / surface | This batch | Deferred (with reason + tracker) |
|---|---|---|
| `_SE_KEY` factory at `strategy-engine.ts:23` | **Add REQUIRED `assetClass: AssetClass` parameter.** Change from `(strategy: string) => ({ exchange: '*', assetClass: '*', strategy, regime: '*' })` to `(strategy: string, assetClass: AssetClass) => ({ exchange: '*', assetClass, strategy, regime: '*' })`. Every call site must thread the cycle's `assetClass`. | None — this is the structural fix. |
| Detect method signatures (18 methods) | **Add REQUIRED `assetClass: AssetClass`** to every detect method on `StrategyEngine` class + every file-based `detectXxx` function. TypeScript compile-fails every caller that doesn't pass it. | None — this is the structural fix. |
| File-based detect modules (9 of them) | **Thread `assetClass` from function param to internal `getCachedNumbersForModule` call.** Each module's `assetClass: '*'` resolver becomes `assetClass: input.assetClass`. | None — this is the structural fix. |
| `callStrategyDetect` dispatcher (`vts-runner.ts:821-899`) | **Promote `symbol` + `assetClass` from optional to REQUIRED.** Remove the "missing symbol/assetClass ctx; null-return" fail-safe at lines 888-892 (B79.0j temporary scaffolding). Each `case` branch threads `assetClass` to the strategyEngine.detect* call. | None. |
| `signal-orchestrator.ts:1562-1854` (16 inline dispatch blocks) | **Each dispatch call appends `, assetClass` from `resolveAssetClass(symbol, 'kraken')` already computed at line 1501.** | None. |
| `module_constants.strategy.<name>.*` rows | **Per-class seed migration ONLY where xStock needs different parameters than crypto.** Pre-audit Step 2 enumerates which (if any) levers are asset-class-meaningful vs cross-class math constants. Where genuinely shared (e.g. ATR period coefficients, base confidence weights), wildcard stays + inline comment. Where xStock needs different (e.g. minimum-history bar counts that differ by feed cadence, volume multipliers that differ by market microstructure), MCE-pattern wildcard-retirement + per-class explicit rows. Expected count: small (umbrella §1.5 row "STRATEGY" notes "often 'none required' if behavior is parameter-symmetric"). | If pre-audit finds 5+ strategies need per-class seeds, surface back to Langston to consider scope-split between resolver-key tightening (this batch) + per-class seed-row sweep (separate batch). |
| `strategy_gates.xstock_spot.<strategy>.enabled` rows | **Seed 17 rows** (the 10 strategies in `XSTOCK_SPOT_ENABLED_STRATEGIES` per `canonical-regime-strategy-map.ts:1920` SIM-cited, MINUS orb which already has its row from B79.0d, PLUS 8 more for the strategies the xStock-eligible map COULD admit). Initial DB values: `true` for the 10 currently-enabled (preserves B79.0d shape); `false` for the rest (explicit "not yet calibrated for xStock"). | Per-strategy xStock-calibration of values deferred to Phase 19 active-trade gate work. |
| `strategy_settings` table schema | **Add `asset_class` column + change UNIQUE constraint from `(globalContextId, mode, strategy)` to `(globalContextId, mode, strategy, assetClass)`.** Migration backfills existing rows with `'crypto_spot'` (preserves byte-identical behavior for the only asset class today consuming strategy_settings). | None for schema. UI strategy-toggle UI changes (per-asset-class toggle vs global) deferred — UI work tracked separately in Phase 17 (UI Consolidation). |
| `strategy-sync.ts` `CORE_STRATEGIES` list | **(a) Add `strong_bull_trend` + `orb` to make it 18-strategy-complete** (closes RISK-014 SYSTEM_MANUAL §1878). **(b) Sync rows per asset class** — today `crypto_spot` (preserves what's already in DB); `xstock_spot` rows seeded with `enabled=false` for all 18 (active-trading not wired yet; rows exist for future enablement via the strategy-toggle UI). | UI integration of per-class toggle deferred — see above. |
| `strategy-mapper.ts` (Directive 11.4H.6G) per-class support | **Per-class regime → favored-strategies mapping.** Today `getFavoredStrategiesForRegime(regime)` returns a class-agnostic list from `mapping-regime-strategy.json`. New signature: `getFavoredStrategiesForRegime(regime, assetClass)`. Three implementation options on the table — see §9 Open Question Q-A. Default proposal: nested `byAssetClass: { crypto_spot: {...regimes}, xstock_spot: {...regimes} }` in the canonical JSON + thin per-class TS dispatcher at `server/core/strategy-mapper.ts` (no per-class wrappers in `server/asset_classes/<class>/` because the dispatcher itself isn't per-class — it lookups by class). For xStock, initial map: snapshot crypto-side mapping as-is for the 5 regimes, then surgically remove `defensive_hedge` (BTC-decorrelation strategy, doesn't apply to xStocks) + add `orb` to TFS + IE regimes (per xStock-specific opening-range microstructure). Defer further per-class calibration to Phase 19. | Calibration of per-class regime→strategy mapping values (which strategies favor which xStock regimes) is a Phase 19 calibration concern; we ship a reasonable shape (clone of crypto minus defensive_hedge plus orb routing) and let Phase 19 measurements refine. |
| `hybrid-integration.ts` `selectHybridStrategy()` taxonomy | **Replace legacy types (H1_TREND_SNIPER / H2_SLINGSHOT / H3_GATECRASHER / H4_MOMENTUM_LINK) with canonical hybrid keys (pivot_shift / reverse_impulse / defensive_hedge / adaptive_flow / volatility_edge).** Closes BUG-007 from SYSTEM_MANUAL §1851. Add a new branch for non-hybrid strategies (strong_bull_trend, orb) that returns the strategy key itself instead of synthesizing a hybrid taxonomy entry. **No per-class behavior change** in this batch — hybrid integration is class-agnostic by design (the confluence math doesn't depend on asset class). | HYBRID_PARAMS promotion from compile-time `system-guards.js` to `module_constants` deferred to Phase 19 (no asset-class-meaningful difference observed today). |
| `STRATEGIES` const at `canonical-regime-strategy-map.ts:364-382` | **Add `STRONG_BULL_TREND` + `ORB` entries** to make it 19-key-complete (matches `STRATEGY_DISPLAY_NAMES` at lines 402-405). Small + obvious closure of the inconsistency. | None. |
| `SYSTEM_MANUAL.md` Chapter 2 (lines 1225-1900) | **Governance update at Step 10.** Current text references 17 strategies, old regime names (BULL_STABLE / BEAR_VOLATILE etc.), and a DSS service that was deleted in Batch 14. Update to reflect current 18-strategy + canonical 5-regime + post-DSS shape. Resolves stale BUG-006 / BUG-007 / RISK-014 closure entries. | None — Tier-2 doc update is part of this batch's governance close. |

**Resolver-key tightening rule (this batch's contribution to the pattern):** at every `getCachedNumbersForModule('strategy.<name>', _SE_KEY('<name>'))` call site, the `_SE_KEY` factory now requires `assetClass` as a second arg. The factory returns `{ exchange: '*', assetClass, strategy, regime: '*' }` — wildcard exchange + wildcard regime are preserved (strategy params don't vary by exchange or regime), but `assetClass` becomes the cycle's REQUIRED parameter. This is the MCE-pattern wildcard-retirement semantics scoped to the strategy-resolver layer.

---

## §2.5 — Modularization respect (Kyle directive 2026-05-24)

**The per-asset-class modularization pattern under `server/asset_classes/<class>/` is load-bearing.** Pre-audit confirms:

- `xstock_spot/` already houses 14 modules: `eval-cycle.ts`, `friction.ts`, `global-filter.ts`, `imf-evaluator.ts`, `index.ts`, `lane-eligibility.ts`, `market-hours.ts`, `ohlc-aggregator.ts`, `pattern-filter.ts`, `pattern-pool-filters.ts`, `regime-thresholds.ts`, `scanner.ts`, `sp500-backstop.ts`, `universe-bootstrap.ts`, `universe-service.ts`.
- `crypto_spot/` houses 4: `friction.ts`, `index.ts`, `pattern-pool-filters.ts`, `regime-thresholds.ts` (the rest of crypto's logic remains in its original locations from before the per-class extraction discipline began).
- The `xstock_spot/eval-cycle.ts` **does NOT call detect methods directly.** It imports `callStrategyDetect` from `vts-runner.ts` (line 48-54) — the centralized dispatcher — and invokes the same strategy detect functions as crypto VTS. The 2-surface dispatch enumeration (Surface A = signal-orchestrator, Surface B = `callStrategyDetect`) is correct.
- The `xstock_spot/lane-eligibility.ts` modularization (B79.0m.b2) was a PURE-LOGIC extraction for unit-test isolation — not a fork of strategy dispatch logic. The same module is consumed by both VTS paths.

**Architectural decision this scope locks:** **DO NOT create per-class strategy dispatchers in `server/asset_classes/<class>/`.** The dispatcher MUST stay centralized at `vts-runner.ts:callStrategyDetect`. Asset-class threading happens AT the dispatcher (where `assetClass` becomes a REQUIRED parameter) and propagates DOWN to the shared detect methods. Per-class detect logic doesn't exist (and shouldn't — the detect math is the same across asset classes; only the parameter VALUES differ via `module_constants`).

**Where modularization IS appropriate this batch:**
- **`server/asset_classes/xstock_spot/strategy-map.ts` (NEW, optional)** — thin TS wrapper exporting `XSTOCK_FAVORED_STRATEGIES_BY_REGIME` constant for compile-time access (mirrors the existing `regime-thresholds.ts` shape). Consumed by the per-class dispatcher at `server/core/strategy-mapper.ts`. Pre-audit decides whether this is the right shape vs. keeping all map data in the canonical JSON.
- **`server/asset_classes/xstock_spot/strategy-config.ts` (NEW, optional)** — thin TS wrapper exporting `XSTOCK_SPOT_STRATEGY_ENABLEMENT` set, currently bridged via the `XSTOCK_SPOT_ENABLED_STRATEGIES` set in `canonical-regime-strategy-map.ts:1920`. Marginal value — most enablement now flows via `module_constants.strategy_gates.xstock_spot.<strategy>.enabled` rows. **Defer to Phase 17 UI consolidation unless pre-audit finds a runtime need.**

**Where modularization is NOT appropriate this batch:**
- **No `server/asset_classes/<class>/detect-dispatcher.ts`** — that would fork the dispatch surface and break the shared-detect-method-with-per-class-parameter invariant.
- **No `server/asset_classes/<class>/strategy-engine.ts`** — same reason. The detect math is class-agnostic; only parameters differ.
- **No per-class hybrid-integration.ts** — the confluence math is class-agnostic (quant + pattern + ML weights are universal).

---

## §3 — Code changes

Concrete file:line modifications. Pre-audit (Step 2) will expand the caller-site enumeration via compile-driven audit; this section captures the load-bearing surface API changes.

### §3.1 — `server/services/strategy-engine.ts`

**`_SE_KEY` factory change (line 23):**

**Before:**
```ts
const _SE_KEY = (strategy: string) => ({ exchange: '*', assetClass: '*', strategy, regime: '*' });
```

**After:**
```ts
import type { AssetClass } from '../../shared/asset-classes.js';

const _SE_KEY = (strategy: string, assetClass: AssetClass) => ({
  exchange: '*', assetClass, strategy, regime: '*',
});
```

**Every `_SE_KEY('<name>')` call site (14 sites enumerated in §0) becomes `_SE_KEY('<name>', assetClass)` where `assetClass` is the detect method's REQUIRED parameter.**

**Detect method signature change (representative example for `detectVWAPPullback`):**

**Before:**
```ts
detectVWAPPullback(
  indicators: TechnicalIndicators,
  settings: TradingSettings,
  priceHistory?: PriceData[]
): StrategySignal | null {
  // ...
  const c = getCachedNumbersForModule('strategy.vwap_pullback', _SE_KEY('vwap_pullback'));
  // ...
}
```

**After:**
```ts
detectVWAPPullback(
  indicators: TechnicalIndicators,
  settings: TradingSettings,
  priceHistory: PriceData[] | undefined,
  assetClass: AssetClass,  // REQUIRED per B79.0n.STRATEGY — no silent default
): StrategySignal | null {
  // ...
  const c = getCachedNumbersForModule('strategy.vwap_pullback', _SE_KEY('vwap_pullback', assetClass));
  // ...
}
```

Same pattern applied to all 9 in-class quant detect methods (`detectVWAPPullback`, `detectABCDLong`, `detectSMATrendRide`, `detectBreakout`, `detectMeanReversion`, `detectRangeTrading`, `detectVWAPBounce`, `detectLiquidityTrap`, `detectDHMA`) AND all 9 in-class wrappers that delegate to file-based modules (`detectMorningStar`, `detectInsideBarReversal`, `detectSupportBounce`, `detectPivotShift`, `detectReverseImpulse`, `detectDefensiveHedge`, `detectAdaptiveFlow`, `detectVolatilityEdge`, `detectStrongBullTrend`). Each wrapper passes `assetClass` through to the file-based detect function.

`detectORB` (line 1533) is **already class-aware** — its existing `ctx?: { assetClass: string; symbol: string; now?: Date }` parameter gets PROMOTED to REQUIRED `ctx: { assetClass: AssetClass; symbol: string; now?: Date }` (consistency with the rest; removes the silent default that defaults `ctx.assetClass` to `'xstock_spot'` per orb.ts header comment).

**Helper method `detectBullishReversal` (line 1040):** also reads from `module_constants` via `_SE_KEY('vwap_pullback')` — needs `assetClass` threaded through from its caller (`detectVWAPPullback`).

### §3.2 — `server/strategies/*.ts` (9 file-based modules)

Each file-based detect function gains REQUIRED `assetClass: AssetClass`:

**Before (representative — `morning-star.ts:75`):**
```ts
export function detectMorningStar(
  indicators: TechnicalIndicators,
  candles: PriceData[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  // ...
  const c = getCachedNumbersForModule('strategy.morning_star', {
    exchange: '*', assetClass: '*', strategy: STRATEGY_KEY, regime: '*',
  });
  // ...
}
```

**After:**
```ts
export function detectMorningStar(
  indicators: TechnicalIndicators,
  candles: PriceData[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // REQUIRED per B79.0n.STRATEGY
): StrategySignal | null {
  // ...
  const c = getCachedNumbersForModule('strategy.morning_star', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  // ...
}
```

Same shape applied to: `adaptive-flow.ts`, `defensive-hedge.ts`, `inside-bar-reversal.ts`, `morning-star.ts`, `pivot-shift.ts`, `reverse-impulse.ts`, `support-bounce.ts`, `volatility-edge.ts`, `strong-bull-trend.ts`.

**`orb.ts` (already class-aware):** `assetClass: 'xstock_spot'` hardcoded at lines 171, 191 changes to `assetClass: ctx.assetClass` so ORB participates in the same parameterization pattern (no functional change since ORB only runs on xstock_spot today, but uniform shape across all 18 detects).

`defensive-hedge.ts` (line 88-89, 108) has TWO resolver-key sites — both updated.
`reverse-impulse.ts` (line 67-68, 87) has TWO resolver-key sites — both updated.
`support-bounce.ts` (lines 86-87, 162-163) has TWO resolver-key sites — both updated.
`strong-bull-trend.ts` (line 76-77, 94) has TWO resolver-key sites — both updated.

### §3.3 — `server/services/vts-runner.ts` `callStrategyDetect` dispatcher (lines 821-899)

**Before (signature):**
```ts
export function callStrategyDetect(
  strategy: string,
  indicators: any,
  ohlcData: any[],
  patternInput: PatternInput | null,
  symbol?: string,
  assetClass?: string,
): StrategySignal | null { ... }
```

**After:**
```ts
export function callStrategyDetect(
  strategy: string,
  indicators: any,
  ohlcData: any[],
  patternInput: PatternInput | null,
  symbol: string,         // REQUIRED per B79.0n.STRATEGY
  assetClass: AssetClass, // REQUIRED per B79.0n.STRATEGY
): StrategySignal | null { ... }
```

**Each `case` branch updated to thread `assetClass` to its detect call.** Example for `vwap_pullback`:

**Before (line 834):**
```ts
case 'vwap_pullback':
  return strategyEngine.detectVWAPPullback(indicators, STRATEGY_CALL_SETTINGS, ohlcData);
```

**After:**
```ts
case 'vwap_pullback':
  return strategyEngine.detectVWAPPullback(indicators, STRATEGY_CALL_SETTINGS, ohlcData, assetClass);
```

**B79.0j fail-safe at lines 888-892 REMOVED** (the "missing symbol/assetClass ctx; null-return" branch is no longer needed since both are now REQUIRED at the TypeScript compile level).

**Two callers of `callStrategyDetect` need updates:**
- `vts-runner.ts` internal callers (the crypto VTS path) — pre-audit will enumerate (likely 1-2 sites). Each computes assetClass via `resolveAssetClass(symbol, 'kraken')` and threads it.
- `xstock_spot/eval-cycle.ts` callers (the xStock VTS path) — pre-audit will enumerate (likely 1-2 sites). Each passes the pair's `assetClass` (already resolved at the per-pair entry point — likely `'xstock_spot' as const`).

### §3.4 — `server/services/signal-orchestrator.ts` (16 inline dispatch blocks, lines 1562-1854)

**Each `if (activeStrategies.has(...))` block updated** to thread `assetClass` to the detect call. The `assetClass` value is **already computed** at line 1501 (`mce.computeContext(..., resolveAssetClass(symbol, 'kraken'))`) — it just needs to be captured in a local for re-use through the dispatch block.

**Before (representative — line 1563):**
```ts
const rawSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny);
```

**After:**
```ts
const rawSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny, assetClass);
```

Where `assetClass` is captured from `const assetClass = resolveAssetClass(symbol, 'kraken');` set near line 1501 (just before the existing MCE call at line 1501 already does this resolution).

Same shape across all 16 dispatch blocks: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, (liquidity_trap is no-op per Batch 70.3), dhma, morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge, strong_bull_trend, orb.

The existing `orb` block (line 1839-1854) already threads `assetClass` via `{ assetClass: orbAssetClass, symbol }` — the post-batch shape converges on a single REQUIRED-parameter form.

### §3.5 — `server/services/strategy-sync.ts` (per-class sync)

**Before (CORE_STRATEGIES list, lines 21-41):**

17 strategies; missing `strong_bull_trend` + `orb`.

**After:**

```ts
const CORE_STRATEGIES = [
  'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout',
  'mean_reversion', 'range_trade', 'vwap_bounce', 'liquidity_trap', 'dhma',
  'morning_star', 'inside_bar_reversal', 'support_bounce', 'pivot_shift',
  'reverse_impulse', 'defensive_hedge', 'adaptive_flow', 'volatility_edge',
  'strong_bull_trend',   // B63 — was missing pre-B79.0n.STRATEGY
  'orb',                 // B79.0d — was missing pre-B79.0n.STRATEGY
] as const;
```

**Per-asset-class sync:**

```ts
import { ASSET_CLASSES, type AssetClass } from '../../shared/asset-classes.js';

const SYNC_ASSET_CLASSES: AssetClass[] = ['crypto_spot', 'xstock_spot'];

async syncGlobalStrategies(mode: 'live' | 'paper', assetClass: AssetClass): Promise<{ added: string[]; existing: number }> {
  const existingStrategies = await storage.listStrategySettings({
    globalContextId: GLOBAL_CONTEXT_ID, mode, assetClass,
  });
  // ... rest of body updated to scope upsertStrategySettings calls by assetClass
}

async syncAllUsers(): Promise<{ totalAdded: number; usersProcessed: number }> {
  // ...
  for (const mode of MODES) {
    for (const assetClass of SYNC_ASSET_CLASSES) {
      const result = await this.syncGlobalStrategies(mode, assetClass);
      totalAdded += result.added.length;
    }
  }
  // ...
}
```

xStock rows seeded with `enabled: false` for all 18 (active-trading not wired yet; rows exist for future enablement). Crypto rows preserve current `enabled` state (no behavior change).

### §3.6 — `shared/schema.ts` `strategySettings` table

**Before (lines 594-606):**
```ts
export const strategySettings = pgTable("strategy_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  enabled: boolean("enabled").default(true),
  params: text("params"),  // JSON
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextModeStrategy: uniqueIndex("strategy_settings_global_context_mode_strategy_idx").on(table.globalContextId, table.mode, table.strategy),
}));
```

**After:**
```ts
export const strategySettings = pgTable("strategy_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  assetClass: varchar("asset_class", { length: 20 }).notNull(),  // B79.0n.STRATEGY — REQUIRED
  enabled: boolean("enabled").default(true),
  params: text("params"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextModeStrategyAssetClass: uniqueIndex("strategy_settings_global_context_mode_strategy_asset_class_idx").on(table.globalContextId, table.mode, table.strategy, table.assetClass),
}));
```

Same shape for `strategySettingsAudit` (lines 609+) — add `assetClass` column.

### §3.7 — Migration: `drizzle/migrations/2026-05-24-b79-0n-strategy-per-class.sql`

```sql
BEGIN;

-- Step 1: Add asset_class column to strategy_settings (backfill 'crypto_spot' for existing rows)
ALTER TABLE strategy_settings ADD COLUMN asset_class VARCHAR(20);
UPDATE strategy_settings SET asset_class = 'crypto_spot' WHERE asset_class IS NULL;
ALTER TABLE strategy_settings ALTER COLUMN asset_class SET NOT NULL;

-- Step 2: Drop old unique index, add new one with asset_class
DROP INDEX IF EXISTS strategy_settings_global_context_mode_strategy_idx;
CREATE UNIQUE INDEX strategy_settings_global_context_mode_strategy_asset_class_idx
  ON strategy_settings (global_context_id, mode, strategy, asset_class);

-- Step 3: Same for strategy_settings_audit
ALTER TABLE strategy_settings_audit ADD COLUMN asset_class VARCHAR(20);
UPDATE strategy_settings_audit SET asset_class = 'crypto_spot' WHERE asset_class IS NULL;
ALTER TABLE strategy_settings_audit ALTER COLUMN asset_class SET NOT NULL;

-- Step 4: Seed strategy_gates rows for xstock_spot strategies (9 new + 1 existing orb = 10 total enabled)
-- Per XSTOCK_SPOT_ENABLED_STRATEGIES (canonical-regime-strategy-map.ts:1920: 6 quant + 3 file pattern + ORB).
-- ORB already seeded by B79.0d migration. Add the other 9 here with enabled=true.
-- Pre-audit confirms exact list of 6 quant + 3 file pattern entries.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, set_by)
VALUES
  ('strategy_gates', '*', 'xstock_spot', 'vwap_pullback',       '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'breakout',            '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'mean_reversion',      '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'range_trade',         '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'sma_trend_ride',      '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'strong_bull_trend',   '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'morning_star',        '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'inside_bar_reversal', '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'support_bounce',      '*', 'enabled', 'true'::jsonb, 'b79-0n-strategy')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Step 5: Per-class strategy.* lever seeds — DEFERRED to pre-audit.
-- Pre-audit Step 2 enumerates which (if any) strategy levers are asset-class-meaningful.
-- For each meaningful lever: wildcard-retirement + per-class explicit rows (MCE pattern).
-- For each cross-class lever: wildcard stays + inline comment in code.
-- This migration is the placeholder — strategy.* seed rows added in Step 3 implementation diff
-- only AFTER pre-audit dispositions are locked.

COMMIT;
```

**Rollback stub** (sibling file `2026-05-24-b79-0n-strategy-per-class-rollback.sql`):

```sql
BEGIN;
-- Reverse strategy_gates xstock_spot rows
DELETE FROM module_constants
WHERE module_name = 'strategy_gates' AND asset_class = 'xstock_spot' AND set_by = 'b79-0n-strategy';
-- Reverse strategy_settings_audit schema
DROP INDEX IF EXISTS strategy_settings_audit_asset_class_idx;
ALTER TABLE strategy_settings_audit DROP COLUMN asset_class;
-- Reverse strategy_settings schema
DROP INDEX IF EXISTS strategy_settings_global_context_mode_strategy_asset_class_idx;
CREATE UNIQUE INDEX strategy_settings_global_context_mode_strategy_idx
  ON strategy_settings (global_context_id, mode, strategy);
ALTER TABLE strategy_settings DROP COLUMN asset_class;
COMMIT;
```

### §3.8 — `server/core/strategy-mapper.ts` (Directive 11.4H.6G per-class)

**Default proposal — final shape pending Q-A resolution (§9):**

Canonical JSON `bridge/canonical/mapping-regime-strategy.json` migrates from flat shape to:

```json
{
  "_schema": "regime-mapping/v3.0.0",
  "_metadata": { ... },
  "byAssetClass": {
    "crypto_spot": {
      "TREND_FRIENDLY_STABLE": { "favoredStrategies": [...], "favoredSignalTypes": [...] },
      "HIGH_VOLATILITY_UNSTABLE": { ... },
      "IMPULSE_EXPANSION": { ... },
      "RANGE_BOUND_STABLE": { ... },
      "STRUCTURAL_TRANSITION": { ... }
    },
    "xstock_spot": {
      "TREND_FRIENDLY_STABLE": { "favoredStrategies": [...includes orb], "favoredSignalTypes": [...] },
      "HIGH_VOLATILITY_UNSTABLE": { ... },
      "IMPULSE_EXPANSION": { ... includes orb },
      "RANGE_BOUND_STABLE": { ... no defensive_hedge },
      "STRUCTURAL_TRANSITION": { ... no defensive_hedge }
    }
  }
}
```

xStock subtree differences from crypto:
- Remove `defensive_hedge` everywhere (BTC-decorrelation, not applicable to xStocks)
- Add `orb` to TFS + IE (xStock-specific opening-range microstructure; only fires in 14:30-17:00 UTC window per orb.ts)
- Otherwise preserve crypto's favored strategies + signal types as the starting point

**`strategy-mapper.ts` signature change:**

**Before:**
```ts
export function getFavoredStrategiesForRegime(regime: string): string[] {
  const canonical = typedCanonicalMap[regime] as CanonicalEntry | undefined;
  // ...
}
```

**After:**
```ts
import type { AssetClass } from '../../shared/asset-classes.js';

export function getFavoredStrategiesForRegime(regime: string, assetClass: AssetClass): string[] {
  const classMap = (typedCanonicalMap.byAssetClass as Record<AssetClass, Record<string, CanonicalEntry>>)[assetClass];
  if (!classMap) throw new Error(`[11.4H.6G][Mapper] No canonical entry for asset class ${assetClass}`);
  const canonical = classMap[regime];
  if (!canonical) {
    console.warn(`[11.4H.6G][Mapper] Missing canonical regime entry: ${regime} for ${assetClass}`);
    return ["Unknown Strategy"];
  }
  // ...
}
```

`getFavoredSignalTypesForRegime` and `getCanonicalRegimes` get same per-class signatures.

**Callers updated** — `mce.computeContext()` already resolves assetClass; downstream callers (regime → strategy lookup in `signal-orchestrator.ts` and `vts-runner.ts`) get assetClass threaded.

### §3.9 — `server/services/hybrid-integration.ts` `selectHybridStrategy()` taxonomy fix

**Before (lines 208-223):**
```ts
private selectHybridStrategy(quant: QuantSignal, pattern: PatternSignal): HybridStrategyType {
  const trendStrategies = ['sma_trend_ride', 'vwap_pullback', 'vwap_bounce'];
  const momentumStrategies = ['breakout', 'dhma'];
  const reversionStrategies = ['mean_reversion', 'range_trading'];
  if (trendStrategies.includes(quant.strategy)) return 'H1_TREND_SNIPER';
  if (momentumStrategies.includes(quant.strategy)) return 'H2_SLINGSHOT';
  if (reversionStrategies.includes(quant.strategy)) return 'H3_GATECRASHER';
  return 'H4_MOMENTUM_LINK';
}
```

**After (replace legacy taxonomy with canonical hybrid keys):**
```ts
private selectHybridStrategy(quant: QuantSignal, pattern: PatternSignal): string {
  // B79.0n.STRATEGY — Replaces legacy H1_TREND_SNIPER / H2_SLINGSHOT / H3_GATECRASHER /
  // H4_MOMENTUM_LINK with canonical hybrid keys per SYSTEM_MANUAL §1851 BUG-007 fix.
  // The mapping below derives the canonical hybrid strategy from the quant + pattern combination
  // per the canonical regime-strategy map (Directive 11.4H.6G).
  const PATTERN_TO_HYBRID: Record<string, string> = {
    MORNING_STAR: 'pivot_shift',
    PINBAR:       'reverse_impulse',
    ENGULFING:    'defensive_hedge',
    TRI_STAR:     'adaptive_flow',
    ABCD:         'volatility_edge',
  };
  const candidate = PATTERN_TO_HYBRID[pattern.pattern];
  if (candidate) return candidate;
  // Non-hybrid quant fallback: return the quant strategy key itself rather than synthesizing.
  // strong_bull_trend + orb are QUANT (not hybrid) and shouldn't appear here in practice, but
  // returning the key keeps the downstream HybridSignal interface honest.
  return quant.strategy;
}
```

**`HybridStrategyType` type definition update** (currently in `server/types.ts` or similar — pre-audit will locate):

Before:
```ts
type HybridStrategyType = 'H1_TREND_SNIPER' | 'H2_SLINGSHOT' | 'H3_GATECRASHER' | 'H4_MOMENTUM_LINK';
```

After:
```ts
type HybridStrategyType = 'pivot_shift' | 'reverse_impulse' | 'defensive_hedge' | 'adaptive_flow' | 'volatility_edge';
```

**No per-class behavior in hybrid-integration.** The confluence math (`computeEnsembleScore`, `applyPatternDecay`, `isValidTimeframePair`, `detectConfluence`) is class-agnostic by design — quant + pattern + ML weights are universal across asset classes. Per-class HYBRID_PARAMS would be Phase 19 calibration work; no asset-class-meaningful difference observed today.

### §3.10 — `server/config/canonical-regime-strategy-map.ts` STRATEGIES const completion

**Before (lines 364-382):**

17 strategy enum entries; missing `STRONG_BULL_TREND` + `ORB`.

**After:**

```ts
export const STRATEGIES = {
  // ... existing 17 entries
  STRONG_BULL_TREND: 'strong_bull_trend' as const,  // B63
  ORB: 'orb' as const,                              // B79.0d
} as const;
```

Small + obvious completion of the inconsistency. `STRATEGY_DISPLAY_NAMES` (lines 402-405) already has these — `STRATEGIES` should match.

---

## §4 — Unit tests

1. **REQUIRED-`assetClass` TYPE LOCK** — `server/tests/unit/b79-0n-strategy-required-assetclass.test.ts`. 18 `@ts-expect-error` regression locks: every detect method on `StrategyEngine` + every file-based `detectXxx` function + `callStrategyDetect` MUST be a compile error when called without `assetClass`. Same pattern STORAGE + MCE used.

2. **`_SE_KEY` factory class-aware resolution** — `server/tests/unit/b79-0n-strategy-se-key-factory.test.ts`. Construct factory calls with `crypto_spot` and `xstock_spot`, assert the returned resolver key contains the correct `assetClass` field (not `'*'`).

3. **callStrategyDetect REQUIRED-symbol-and-assetClass** — `server/tests/unit/b79-0n-callstrategydetect-required.test.ts`. Compile-time assertions + runtime smoke: dispatcher accepts `assetClass: AssetClass` (not `string?`), errors out on omitted parameters at TypeScript level.

4. **strategy-mapper per-class** — `server/tests/unit/b79-0n-strategy-mapper-per-class.test.ts`. (a) `getFavoredStrategiesForRegime('TREND_FRIENDLY_STABLE', 'crypto_spot')` returns expected crypto list. (b) Same regime with `'xstock_spot'` returns list WITHOUT `defensive_hedge` and INCLUDING `orb`. (c) Unknown asset class throws. (d) `getCanonicalRegimes()` returns same 5 regimes for both classes (regime set is class-invariant; the per-class data is the favored strategy list).

5. **strategy-sync per-class** — `server/tests/unit/b79-0n-strategy-sync-per-class.test.ts`. Mock storage, drive `syncAllUsers`, assert: (a) 18 × 2 modes × 2 asset classes = 72 strategy_settings rows synced (or however many missing — depends on test fixture state). (b) crypto_spot rows have `enabled` from existing state; xstock_spot rows seed `enabled: false` for all 18. (c) `strong_bull_trend` + `orb` rows present (regression-lock for RISK-014 closure).

6. **hybrid-integration canonical taxonomy** — `server/tests/unit/b79-0n-hybrid-integration-canonical.test.ts`. (a) `selectHybridStrategy` with PINBAR pattern returns `'reverse_impulse'` (was `'H2_SLINGSHOT'`). (b) Same for MORNING_STAR → `'pivot_shift'`, ENGULFING → `'defensive_hedge'`, TRI_STAR → `'adaptive_flow'`, ABCD → `'volatility_edge'`. (c) Non-hybrid quant fallback returns the quant strategy key.

7. **xStock VTS shadow path picks up class-scoped strategy params** — `server/tests/integration/b79-0n-xstock-vts-strategy-routing.test.ts`. Drive an xstock_spot pair through `xstock_spot/eval-cycle.ts` → `callStrategyDetect('vwap_pullback', ..., 'xstock_spot')`. With test DB seeded with both crypto + xStock `strategy.vwap_pullback` rows at distinct values, assert detect produces signal consistent with xStock row values (not crypto). Regression-lock for the wildcard-retirement-with-seed pattern.

8. **detectORB pre-existing class-aware path preserved** — `server/tests/unit/b79-0n-orb-class-aware-regression.test.ts`. Pre-batch, `detectORB(symbol, ohlc, indicators, { assetClass: 'xstock_spot', symbol })` worked. Post-batch, same call signature (now REQUIRED, was optional) MUST still work byte-for-byte identical. Regression-lock for ORB exemplar.

---

## §5 — Acceptance criteria

### §5.1 — Build + CI

All 4 GitHub Actions checks green: TypeScript Check, Test Suite, Build, Docker Build. No new test failures. **Per CLAUDE.md §5 #19** — CI per-batch confirmation rule applies: `gh run list --branch migration/aws-supabase --limit 1` must show `completed success` before batch close.

### §5.2 — Step 7 verification gates

1. `b79-0n-strategy-required-assetclass.test.ts` — passes (18 `@ts-expect-error` cases).
2. `b79-0n-strategy-se-key-factory.test.ts` — passes.
3. `b79-0n-callstrategydetect-required.test.ts` — passes.
4. `b79-0n-strategy-mapper-per-class.test.ts` — passes.
5. `b79-0n-strategy-sync-per-class.test.ts` — passes.
6. `b79-0n-hybrid-integration-canonical.test.ts` — passes.
7. `b79-0n-xstock-vts-strategy-routing.test.ts` — passes (integration test, mock DB OK).
8. `b79-0n-orb-class-aware-regression.test.ts` — passes (ORB exemplar regression-lock).
9. xStock scanner shadow path continues evaluating per cycle on staging (PM2 logs grep for `[B79.0m.b2]` lines tagged with `xstock_spot` AND for the new `[B79.0n.STRATEGY]` per-class strategy detect resolution log).
10. `strategy_settings` row count: **net add equal to 18 × 2 modes × 1 new asset class (xstock_spot) = 36 new rows** (existing crypto_spot rows preserved + backfilled with `assetClass='crypto_spot'`).
11. `strategy_settings_audit` schema migration applied (no row delta — audit log historical-only).
12. `module_constants` row delta: **net +9** (the 9 new `strategy_gates.xstock_spot.<strategy>.enabled` rows; ORB row pre-exists from B79.0d). Composition: 1 module (`strategy_gates`) × 9 strategies × 1 constant (`enabled`) × 1 asset class (`xstock_spot`) = 9 new rows.
13. **`SELECT COUNT(*) FROM module_constants WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND constant_name='enabled'` returns 10** (the 9 new + the pre-existing orb row from B79.0d).
14. PM2 boot log contains: `[B79.0n.STRATEGY][CACHE_REFRESH] picked up N module_constants rows for strategy.* (asset_class=crypto_spot+xstock_spot)` where N reflects the number of strategy-tunable rows. Emitted from strategy-engine's first cache-refresh cycle post-boot. Step 8 verification looks for this positive signal.
15. **Crypto active-trading path continues firing strategies normally** — PM2 logs grep for `[Phase13][MCE]` followed by `activeStrategies=[...]` for crypto pairs, and at least one `[VWAP Strategy] ✅ Signal generated` (or any per-strategy log) per minute during US market hours. Zero `[B79.0n.STRATEGY] silent-default` warnings (those should never log because the parameter is REQUIRED).
16. **xStock VTS shadow path continues firing strategies normally** — PM2 logs grep for `[B79.0m.b2]` cycle markers + at least one xstock strategy null-reason log per cycle.

### §5.3 — Crypto regression-lock (umbrella §2.2)

24h pre-deploy / 24h post-deploy comparison per the per-metric thresholds:

| Metric | Threshold | Window |
|---|---|---|
| FX5 pool size | ±5% | 24h |
| Signal generation rate | ±5% | 24h |
| VTS trade rate | ±5% | 24h |
| Active trade-open rate | ±1-2 trades/day OR ±15% 7d rolling | 7-day rolling |

Same scheduled-alert handoff STORAGE + MCE used: a new alert created at deploy + fires 24h later.

**Soak-baseline timing:** STRATEGY deploy targeted ≥2026-05-25T12:00Z so the pre-deploy 24h baseline window sits fully post-MCE-stabilization (MCE deployed 2026-05-22T12:10Z — gives ~3 days of clean baseline). If STRATEGY deploys earlier, baseline window will partially overlap MCE stabilization; document in completion report as partial-overlap if unavoidable.

### §5.4 — Step 8 Langston second-pass

Independent UI verification via Claude-in-Chrome on staging: navigate xStocks tab + Filter Diagnostics, confirm xStock VTS evaluation continues showing per-strategy counts across the 10 enabled strategies (the 9 file/quant + orb). Confirm strategy-settings UI continues showing crypto strategy toggles (no behavior change) + emerging xStock strategy rows (visible at the DB layer; UI integration deferred to Phase 17 per §2 EXECUTION row).

---

## §6 — Crypto-by-construction-NONE invariant

Every code change in this batch must be either ADDITIVE (adds asset-class branch; crypto path unchanged at runtime) or TYPE-ENFORCED with explicit crypto callers updated to pass `'crypto_spot' as const` (semantically identical to today's silent default).

**Proof for this batch:**

- **`_SE_KEY` factory tightening:** silent default removed; every existing caller is updated to pass `'crypto_spot'` (semantically). When the factory was wildcard, crypto+xStock both resolved to the same wildcard row. Post-batch: crypto callers resolve via explicit `'crypto_spot'` and either find a per-class row (if seeded) or fall through to wildcard (most levers unchanged) — semantically identical to today's resolution for crypto.
- **Detect method REQUIRED-`assetClass`:** every existing caller updated to thread the resolved assetClass. crypto callers pass `'crypto_spot'`. crypto path execution: byte-for-byte identical to today (same wildcard rows resolved, same detect logic).
- **`callStrategyDetect` REQUIRED-symbol-and-assetClass:** B79.0j's "missing symbol/assetClass ctx" warn-and-null branch was already a fail-safe — it only fired for ORB (the only strategy that required them pre-batch). Removing the branch is safe because the TypeScript REQUIRED-parameter discipline catches every site at compile time.
- **`strategy-sync.ts` per-class sync:** xStock rows ADD; crypto rows preserve current state. Sync execution: no overwrite of crypto rows.
- **`strategy_settings` schema migration:** ALTER TABLE adds column with `'crypto_spot'` backfill — existing queries that don't filter by asset_class continue resolving the crypto row (since it's the only one until xStock rows are seeded, and then UI integration scopes by class). Crypto API behavior: identical.
- **`strategy-mapper.ts` per-class:** crypto subtree of the migrated JSON is byte-identical to today's flat shape. xStock subtree adds. crypto callers explicitly pass `'crypto_spot'` and get same favored-strategy lists.
- **`hybrid-integration.ts` taxonomy fix:** the legacy `H1_TREND_SNIPER` etc. values were never wired to anything class-aware. Replacing with canonical keys is a stale-taxonomy fix unrelated to asset class; verifies BUG-007 closure with no class-side effect.
- **`STRATEGIES` const completion:** adding `STRONG_BULL_TREND` + `ORB` to the enum has no runtime effect (the strategies already exist as keys in `STRATEGY_DISPLAY_NAMES` and as detect methods). Closes legacy inconsistency.

---

## §7 — Deferred follow-ups (filed at governance close)

1. **RUNNING_ISSUES — Per-class strategy parameter calibration (Phase 19 follow-up).** xStock rows seeded with placeholder-cloned values (where seeded at all). Phase 19 active-trade calibration replaces with measured xStock parameters.

2. **RUNNING_ISSUES — `liquidity_trap` revival or removal decision.** Currently disabled at orchestrator (Batch 70.3) + at VTS callStrategyDetect (line 853-858). Strategy file exists + module_constants rows exist + detect method still in StrategyEngine. Pre-audit's NOT-IN-SCOPE finding: should `liquidity_trap` be (a) revived as long-only failed-breakdown-below-support, (b) deleted entirely, or (c) left disabled but documented? File as RUNNING_ISSUES at this batch's governance close.

3. **HYBRID_PARAMS promotion from compile-time to `module_constants`.** `hybrid-integration.ts` reads `HYBRID_PARAMS.MIN_SCORE`, `HYBRID_PARAMS.WEIGHTS`, `HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW`, `HYBRID_PARAMS.DECAY.LAMBDA / FLOOR` from `server/config/system-guards.js`. If Phase 19 measurements show these need per-class calibration, file as B79.x follow-up. Today: no evidence of asset-class-meaningful difference; defer.

4. **UI strategy-toggle per-class integration.** The strategy-settings UI today exposes a single-class toggle (crypto). Once xStock rows are seeded with `enabled: false`, the UI needs an asset-class selector + per-class toggle UX. Defer to Phase 17 (UI Consolidation).

5. **RISK-011 closure (Strategy Signal Audit Engine stale metrics).** SYSTEM_MANUAL §1859 references NGC/CWQI/DI stale formulas. Per CLAUDE.md §5 #18 (Phase 16 legacy-component review register), file as RUNNING_ISSUES #136 entry for Phase 16 batch review — likely a delete-not-fix candidate.

6. **`strategy-sync.ts` userId-as-mode-key legacy.** Per CLAUDE.md §5 #18 + the bug surfaced in B-NEW-43 (BUG-2026-05-23-A in paper-portfolio-manager), the recurring legacy theme is userId vs mode-key confusion. Sync logic at lines 122-127 uses `verifyUserStrategies(userId, mode)` even though the data is global-context — userId is unused. File as RUNNING_ISSUES #136 Phase 16 register entry for legacy-cleanup audit.

---

## §8 — Asset-class onboarding workflow learnings (placeholder per CLAUDE.md §3.3)

Fills during completion report (Step 11). Empty section acceptable if no new learnings surface; explicit "No new onboarding learnings this batch" required in that case — no filler.

Specific learnings anticipated based on STORAGE + MCE → STRATEGY handoff:

- **Centralized dispatcher pattern preserved for per-class threading.** STORAGE + MCE + STRATEGY all share the pattern: the dispatcher (storage API / MCE singleton / `callStrategyDetect`) is the single place where `assetClass` becomes REQUIRED, and per-class parameter VALUES live in `module_constants` (data) — NOT in per-class detect-logic forks. The `xstock_spot/` modularization pattern is for pure helpers (regime-thresholds, lane-eligibility, friction shape) that don't fork dispatch. Document this distinction in ASSET_CLASS_ONBOARDING_WORKFLOW Section "What modularization is FOR vs NOT FOR."
- **TypeScript REQUIRED-parameter discipline as the wildcard-elimination forcing function.** STORAGE + MCE + STRATEGY all rely on the same recipe: promote optional `assetClass?: string` to REQUIRED `assetClass: AssetClass`, let TypeScript compile-fail every caller, fix each call site one-by-one until clean. This produces a 100%-coverage audit by construction — no grep can miss what the compiler catches. Document as the canonical pattern.
- **Wildcard `'*'` resolver-key tightening is per-row-type, not per-resolver-function.** The `_SE_KEY` factory was wildcard; some resolver factories elsewhere in the codebase are class-aware already (B-PHASE-A2 DirectionalBiasStore); some stay wildcard intentionally (math constants like Wilder's smoothing factor in `regime-age-factor.ts:150`). The decision is per-row-type, based on whether the lever is asset-class-meaningful. ASSET_CLASS_ONBOARDING_WORKFLOW Step 4.9 should distinguish.
- **`callStrategyDetect`'s B79.0j fail-safe was scaffolding, not architecture.** The "missing symbol/assetClass ctx; null-return" branch was added when ORB shipped as the first class-aware strategy. With the rest of the strategies still optional, the fail-safe protected against silent mis-dispatch. Once ALL 18 strategies are REQUIRED, the fail-safe becomes dead code — REMOVED in this batch. Document the pattern: when ONE strategy ships class-aware ahead of the rest, the dispatcher gets a temporary fail-safe; when the rest catch up, the fail-safe removes itself. Mirrors STORAGE's "interim symbol-resolver" pattern.

---

## §9 — Open questions for Langston (Step 1 ACK gate)

**(Q-A) `strategy-mapper.ts` per-class JSON shape — 3-option decision:**

Three implementation options for per-class regime → strategy mapping:

- **Option A (RECOMMENDED): Single canonical JSON with nested `byAssetClass: {crypto_spot: {...regimes}, xstock_spot: {...regimes}}`** — one source of truth, easy side-by-side diff between classes, clean schema migration (v2.0.0 → v3.0.0). Requires migration of `bridge/canonical/mapping-regime-strategy.json` shape + downstream consumers (sync-canonical-bridge.ts, drift-detector). Default proposal in §3.8 above.
- **Option B: Per-class JSON files** (`mapping-regime-strategy-crypto.json` + `mapping-regime-strategy-xstock.json`). Cleaner separation; two files to keep in sync (when new regime added, both files need updating). No nesting; flatter.
- **Option C: Per-class TS files under `server/asset_classes/<class>/regime-strategy-map.ts`** (modularization-pattern-consistent). Matches `regime-thresholds.ts` + `friction.ts` shape. Dispatcher at `server/core/strategy-mapper.ts` becomes per-class-aware. **Drawback:** the canonical JSON loses its single-source-of-truth status; bridge sync becomes per-class-loop.

**CC recommendation: Option A.** Reasoning: (a) `mapping-regime-strategy.json` is consumed by sync-canonical-bridge.ts (`SIM line 573`) + drift-detector + Mapping Drift UI — keeping it as the single source of truth simplifies downstream. (b) Side-by-side comparison of crypto vs xstock favored-strategy lists is THE common review action; nested shape makes diffs trivial. (c) Modularization-pattern-consistency is preserved at the consumer layer (the TS dispatcher in `server/core/strategy-mapper.ts`); the data file is naturally cross-class.

Concur on Option A, or push for Option B / Option C?

**(Q-B) xStock favored-strategy map content — "snapshot crypto minus defensive_hedge plus orb on TFS+IE" — calibration concern:**

The default proposal in §3.8 snapshots crypto's regime → strategy map for xStock, then surgically removes `defensive_hedge` (BTC-decorrelation-specific) and adds `orb` to TFS + IE. This is a reasonable starting shape but is **content/calibration**, not pure plumbing. Two options:

- **(B-1) Ship the default shape this batch.** Gets xStock active-trading routing wired with a sensible starting map. Phase 19 calibration refines based on measured xStock signal quality per regime.
- **(B-2) Ship the plumbing with an empty/placeholder xStock map** (every regime returns an empty list or a `["UNCALIBRATED"]` marker). Phase 19 calibration is the gate that decides what xStock should favor per regime. **Drawback:** xStock active-trading would NEVER fire any signal post-WIRE-IN until Phase 19 fills the map.

**CC recommendation: (B-1).** Reasoning: shipping the default lets Phase 19 measurements actually accumulate; an empty map means xStock active-trading routes through zero strategies and Phase 19 has nothing to measure. The surgical edits (remove defensive_hedge, add orb to TFS+IE) are well-justified at the architecture-doctrine level and don't require measurement.

Concur on (B-1), or push for (B-2)?

**(Q-C) `liquidity_trap` disposition during this batch:**

Pre-audit will surface `liquidity_trap` as DISABLED-but-not-deleted:
- StrategyEngine.detectLiquidityTrap exists at line 825
- Module_constants `strategy.liquidity_trap` rows exist (B72.2)
- orchestrator dispatch is a comment-only no-op (line 1629-1635)
- `callStrategyDetect` returns null with `setNullReason('strategy_disabled_bearish')` (line 852-858)

Three options for this batch:
- **(C-1) Leave as-is.** No work; lives in code as a disabled artifact.
- **(C-2) Add REQUIRED `assetClass` to its signature anyway** (for shape consistency across all 18) but keep the disabled state. Trivial extra work; preserves the "every detect has REQUIRED-`assetClass`" invariant.
- **(C-3) Delete liquidity_trap entirely** (`strategy-engine.ts`, `strategies/`, `module_constants` rows, canonical-regime-strategy-map.ts entry, dispatch sites). Bigger scope; cleaner.

**CC recommendation: (C-2).** Reasoning: (a) The strategy MIGHT be revived later (as long-only failed-breakdown-below-support per the audit-log comment at orchestrator line 1629-1632). (b) Adding REQUIRED-`assetClass` to its signature is trivial. (c) (C-3) deletion is a separate decision (file as RUNNING_ISSUES per §7 #2). Don't delete in-flight per CLAUDE.md §5 #18.

Concur on (C-2), or push for (C-1) / (C-3)?

**(Q-D) Hybrid-integration `selectHybridStrategy` non-hybrid quant fallback shape:**

§3.9 proposes returning `quant.strategy` as the fallback when the pattern doesn't match a canonical hybrid. This means a non-hybrid strategy like `strong_bull_trend` (which is QUANT, not hybrid) would, if it somehow reached the hybrid dispatcher, return `'strong_bull_trend'` from the hybrid-strategy selector. Two interpretations:

- **(D-1) That's fine** — the `HybridSignal.hybridStrategy` field becomes "the strategy that triggered this hybrid signal" which is informative for non-hybrid quant cases. Documented as a fallback.
- **(D-2) That's wrong** — `HybridSignal.hybridStrategy` should ONLY be a canonical hybrid key; non-hybrid quant signals shouldn't reach this code path at all. We need to add a guard upstream that prevents non-hybrid quants from entering `selectHybridStrategy`.

**CC recommendation: (D-1) with inline comment** documenting that the fallback is a "no-canonical-hybrid-pattern-matched" case, expected to be rare in practice but possible for QUANT signals with weak pattern confluence. (D-2) is a deeper investigation of the HybridSignal type contract — better as a separate batch.

Concur on (D-1)?

**(Q-E) `XSTOCK_SPOT_ENABLED_STRATEGIES` set contents — SIM line 1920 reads "6 quant + 3 file pattern + ORB Q-D-gated":**

Pre-audit will confirm the exact 10 strategies in this set by reading `canonical-regime-strategy-map.ts`. The §3.7 migration seeds 9 NEW `strategy_gates.xstock_spot.<strategy>.enabled` rows (ORB pre-exists). Question: should the seeding be (a) the 9 in the enabled set + status `true`, OR (b) all 18 canonical strategies × `enabled` boolean with the 9 set to `true` and the 9 NOT in the enabled set set to `false`?

- **(E-1) Seed only the 9** (matches the enabled set; rows for NOT-yet-enabled strategies absent). Cleaner.
- **(E-2) Seed all 18** (every strategy has an explicit per-class gate row; absent rows fail-hard via `getCachedConstant`). More verbose; preserves explicit-rather-than-implicit doctrine.

**CC recommendation: (E-2).** Reasoning: aligns with NO-SILENT-FALLBACK doctrine; if a row is absent and a future code path queries it without checking for undefined, the system fails hard rather than silently dispatching a not-meant-to-be-enabled strategy. Cost is 9 additional INSERT statements in the migration.

Concur on (E-2)?

**(Q-F) Per-class strategy.* lever seeding scope:**

§3 deferred the per-class `strategy.*` lever seeding to "pre-audit Step 2" decision. Pre-audit will enumerate which (if any) levers are asset-class-meaningful. Three potential outcomes:

- **(F-1) Zero levers need per-class seeds.** All strategy params are math-shape-symmetric (ATR multipliers, base confidence weights, lookback windows that scale with bar interval — and B79.0n.MCE rev3 confirmed the bar-interval invariant). Wildcard rows stay everywhere; only the resolver-key tightening + REQUIRED-`assetClass` plumbing ships. **Most-likely outcome per umbrella §1.5 row STRATEGY.**
- **(F-2) Small number (1-3) need per-class seeds.** E.g. xStock might need a different `volume_confirm_min_history` (xStock cadence is 60-min same as crypto, but volume profiles differ structurally). Wildcard-retirement + per-class explicit rows for those, wildcard stays for the rest.
- **(F-3) Many (5+) need per-class seeds.** Surfaces a deeper xStock-vs-crypto parameter-asymmetry that wasn't visible at scope time. Surface back to Langston to consider scope-split.

**CC recommendation: blind pre-audit + decide at Step 2 ACK.** Pre-audit will enumerate; Langston reviews dispositions at Step 2 review window.

Concur on blind pre-audit?

**(Q-G) Soak baseline reset for STRATEGY:**

MCE's soak alert `616dfcf3` baseline was 24h pre-MCE-deploy = 2026-05-21T12:00Z. STRATEGY's 24h soak fires 24h after STRATEGY deploy — this will be a separate alert with a fresh baseline (24h pre-STRATEGY-deploy = ~2026-05-24T12:00Z or thereabouts).

Concur on fresh baseline?

Reply: **scope v1 FINAL ACK** / **specific decisions on Q-A through Q-G** / **substantive design disagreement on objective**.

---

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §6.5.0.b: this scope file is staged in your inbox at `/home/langston/inbox/b79-0n/B79_0n_STRATEGY_SCOPE.md`. **DO NOT `cd /mnt/gdrive` or run `git -C` against the gdrive mount — it will hang on FUSE I/O (B-NEW-42b empirical: D-state stuck processes, can't be kill -9'd; STORAGE Step 4 RE-ACK hung 10+ min before re-dispatch).** For repo-side verification use `ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && git ...'` — staging server has same code at same commit. Embedded diff snippets above are sufficient for your review without needing to fetch additional repo content.

— Claude Code, 2026-05-24 PM (B79.0n.STRATEGY Step 1 scope v1)
