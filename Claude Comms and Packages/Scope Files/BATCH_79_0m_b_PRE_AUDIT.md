# BATCH 79.0m.b — Step 2 Pre-Implementation Audit

> **Status:** READY FOR LANGSTON STEP 2 REVIEW
> **Author:** Claude Code
> **Created:** 2026-05-11
> **Parent scope:** `BATCH_79_0m_SCOPE.md` (Q3 split half 2 of 2)
> **Resolves:** RUNNING_ISSUES #92 (full closure on ship)

## 🚨 PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2 rule)

| Topic | Previously stated | Now | Reason |
|---|---|---|---|
| Architectural approach | "Carve `evaluatePairForVTS` out of `runPhase10SimulationCycle` (~750 LOC extraction, highest-risk surgery of the quarter)" — rev1+rev2 design asks | **Build new xstock filter pipeline modules; call EXISTING shared post-filter functions; vts-runner.ts UNTOUCHED.** | Kyle directive 2026-05-11: the shared eval surface is MCE + strategy detect + SQE + persist (already modular, asset-class-DB-driven). Filter pipeline is asset-class-owned per Phase 24. My carve-out framing conflated those two layers. Correct framing: xstock owns its scanner + filter pipeline + calls into the existing shared post-filter functions per-pair. |
| LOC estimate | 250-300 (rev2 design ask) | **350-450 of NEW code in xstock-side files + 5-10 LOC of asset-class-param threading + 1 schema field add to skipped-signals log** | Architectural correction expanded the xstock-side code (full global filter + family-IMF evaluator + pattern path) but eliminated the vts-runner extraction. Net is similar in code volume but DRAMATICALLY safer (no touch on crypto's hot path). |
| TEC behavior for xstock | "Per-asset-class config; defaults from B79.TEC" | **xstock_spot trailing-exit + BE-protection ENABLED while crypto_spot stays DISABLED — uses B79.0m.b as the live test of B79.TEC's per-asset-class design.** | Kyle directive 2026-05-11. |
| Filter Diagnostics tab data sources | "By-construction isolated" (rev2 design ask) | **Mostly isolated, ONE confirmed leak: `getSkippedSignalsSummary` (used by `/api/vts/filter-diagnostics`) reads `/logs/vts_skipped_signals/` JSON without asset_class filtering. Once xstock SQE rejections land, they'll co-mingle.** | Audit finding — needs fix in this batch. |

---

## 1. Shared function audit — hidden crypto assumptions

Audited each function in the post-filter chain that xstock-side code will call. Findings and required actions:

### 1.1 `MarketContextEngine.computeContext` (`market-context-engine.ts:856`)

**Two crypto-specific hard contracts must be lifted for xstock:**

**(A) DBS hard-fail at line 883-885:**
```ts
if (!propagatedDbs || !Number.isFinite(propagatedDbs.score)) {
  throw new Error(`[B63][MCE] DBS not propagated for ${symbol} — hard-contract violation.`);
}
```
xstock has no DBS computation today (no equivalent of FX5's directional-bias-store for equity).

**Fix:** add `assetClass: AssetClass` param to `computeContext`. For `assetClass === 'crypto_spot'`, preserve hard-contract. For non-crypto, allow `propagatedDbs` to be undefined → synthesize neutral `{score: 0, category: 'NEUTRAL', slope: 0}`. Document as "Layer-1 starter; per-asset-class DBS computation deferred — RUNNING_ISSUES candidate."

**(B) Macro modifier at line 906:**
```ts
const macroModifierValue = macroContext.modifier.value;
```
`macroContext` is a single global cache populated by `computeMacroModifier` from CoinGecko crypto inputs (BTC dominance + funding rates + mcap momentum). For xstock pairs, applying this crypto-fed modifier is WRONG (Layer-3 evidence would be polluted).

**Fix:** add asset-class-aware macro modifier resolution. For `crypto_spot`: use `macroContext.modifier.value` (existing). For `xstock_spot`: read from `module_constants.mce_config.xstock_spot.macro_modifier` (already seeded as 1.0 placeholder; B79.3 will populate with real equity-macro feed). Same pattern for future asset classes.

**Crypto regression:** the `assetClass` param defaults to `'crypto_spot'` for back-compat; existing callers unchanged.

### 1.2 `calculatePairRegime` (`market-regime.ts:209`)

Pure math kernel — takes `regimeConfig` directly as a param. Already asset-class-aware in the sense that the caller decides which config to pass. **B79.0m.a authored only TFS-branch volatility/momentum scale rows for xstock; other regime branches (RBS/IE/HVU/ST) fall back to wildcard = crypto values.**

**Required action for B79.0m.b:**
- Author asset-class-explicit rows for the other 4 regime branches' volatility/momentum scales (mirror TFS pattern: halve crypto values for equity ATR baseline)
- Loader function that returns `RegimeConfig` for xstock must resolve correctly per-regime via the new rows
- Verify `regimeConfig` reflects asset-class values when MCE is called with `assetClass='xstock_spot'`

### 1.3 `callStrategyDetect` (`vts-runner.ts:782`)

Already has `symbol` + `assetClass` params (B79.0j). Each strategy's detect function reads thresholds from `module_constants.strategy.<name>`. **Most strategies' per-strategy thresholds are wildcard for xstock today (only `strategy.orb` has explicit xstock rows).**

**Required action for B79.0m.b:**
- For each of the 9 non-ORB strategies enabled on xstock, audit `strategy.<name>` rows:
  - `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce` (quant)
  - `inside_bar_reversal`, `morning_star`, `pivot_shift` (pattern)
- Author xstock-explicit rows for ATR-multiplier, absolute-momentum, distance-in-units thresholds (halve crypto values per equity baseline)
- Keep wildcard for scale-free pattern geometry (inside-bar containment %, morning-star body ratios)
- Each xstock-explicit row tagged `updated_by='b79.0m.b-layer1-starter-equity-baseline'`

### 1.4 `evaluateSignalQuality` (`signal_quality_evaluator.ts`)

Already fully asset-class-aware post-B79.0m.a:
- `isStrategyEnabledForAssetClass` reads from `module_constants.strategy_gates.<assetClass>.<strategy>.enabled` (B79.0m.a DB seed)
- `isXstockMarketOpenUTC` gate at line 195 (B79.0L) returns false during weekend close
- SQE thresholds read from `module_constants.sqe_config.<assetClass>.*` (B79.0m.a confirmed seeded)

**No additional work needed for xstock-side wiring.**

### 1.5 Persist (`signal_eval_archive` INSERT + `insertOpenTrade`)

Both functions accept `assetClass` field on the row data and write it to the DB column. Already asset-class-aware. **No additional work.**

### 1.6 TEC config resolver (`trailing-exit-controller.ts`)

`resolveTECConfig(assetClass)` per B79.TEC reads from `module_constants.trailing_exit.<assetClass>.*`. Today:
- `trailing_exit.crypto_spot.break_even_enabled = false` (Variant K)
- `trailing_exit.xstock_spot.break_even_enabled = false` (seeded by B79.TEC, Day 1 default)
- 5 crypto_spot rows for other trailing knobs; xstock has only `break_even_enabled`

**Kyle directive 2026-05-11:** xstock_spot trailing-exit + BE-protection ENABLED. Live test of B79.TEC's per-asset-class design.

**Required action for B79.0m.b:**
- UPDATE `trailing_exit.xstock_spot.break_even_enabled = true`
- Author full set of trailing_exit rows for xstock_spot mirroring crypto's row keys: `target_lock_r`, `trail_distance_atr_multiplier`, `break_even_trigger_r`, moonbag knobs. Starter values for equity context (likely tighter trailing distance than crypto's ATR multiplier since equity ATR is half crypto).
- Verify `resolveTECConfig('crypto_spot')` returns BE=false, `resolveTECConfig('xstock_spot')` returns BE=true via direct test
- Extend B79.TEC HARD-FAIL assertion to require all behavioral TEC keys present for xstock_spot (per RUNNING_ISSUES #85 follow-up)

### 1.7 Exit-path (vts-runner exit cycle, lines ~2200-2400)

Iterates `openVirtualTrades` Map (per-trade `assetClass` tagged at insert time). The TEC trailing eval reads OHLC for the trade's symbol from cached source — **needs to resolve correct OHLC source per assetClass for xstock trades.**

**Required action for B79.0m.b:**
- Audit the exit-cycle OHLC source resolution. Currently reads from crypto's live-pricing-adapter cache. For xstock, must read from `xstock_spot_ohlc_1m` archive (or whatever the xstock live-pricing source is — confirm via existing freshness path).
- Add unit test: open a synthetic xstock trade, simulate exit-condition met, verify exit path closes via `markOpenTradeClosed` + writes correct close row to `paper_sim_trades` with `asset_class='xstock_spot'`.
- G4 end-to-end gate: at least one xstock VTS trade opens AND closes cleanly within 24h forward-watch (Langston rev2 blast-radius #1).

### 1.8 Setup-hash key collision (vts-runner.ts:1042)

`lastSetupHash` Map keyed by `${symbol}:${strategy}` — cross-asset collision risk if any xstock symbol literally matches a crypto symbol (extremely unlikely given the X-suffix display form, but the canonical form `AAPL/USD` could theoretically collide with a hypothetical crypto `AAPL/USD`).

**Required action for B79.0m.b:**
- Change key composition to `${assetClass}:${symbol}:${strategy}` everywhere `lastSetupHash` is read or written. 1-line change.

### 1.9 DBS hard-contract handling

Already covered in 1.1(A) — synthetic neutral DBS for non-crypto asset classes. Specifically:
- `directional-bias-store` is FX5-scanner-only; not touched
- `propagatedDbs` to MCE becomes optional for non-crypto
- All downstream consumers of DBS (Path B sustainability gate, regime branch routing) must treat `slope=0, score=0, category='NEUTRAL'` as "Path A only, no DBS-based routing" → effectively the conservative path

**Required action for B79.0m.b:**
- Grep all 18 strategies for DBS usage. For each, confirm null/zero DBS produces a defined neutral behavior. Add unit-test matrix asserting null-DBS does not produce NaN/error/skew in any strategy's `detect*` output.

### 1.10 Filter Diagnostics tab data sources — co-mingling audit

**Verified isolated:**
- `/api/xstocks/filter-diagnostics` reads `xstockSpotScanner.getDiagnostics()` + `signal_eval_archive WHERE asset_class='xstock_spot'` — xstock-only by-construction ✓
- `/api/vts/filter-diagnostics` reads `fx5Scanner.getLastScanDiagnostics()` + `fx5Scanner.getRolling24hDiagnostics()` + `getVTSEvalRolling24h()` — crypto-only by-construction (fx5-scanner doesn't scan xstock; vts-runner in-memory counters don't see xstock pairs) ✓

**Confirmed leak:** `/api/vts/filter-diagnostics` also reads `getSkippedSignalsSummary(1)` (line 1551 of `routes/vts.ts`). This function reads from `/logs/vts_skipped_signals/` JSON file logs which DON'T currently filter by asset_class. Once xstock SQE rejections start logging here, they'll appear in the crypto Filter Diagnostics tab.

**Required action for B79.0m.b:**
- Add `asset_class` field to `SkippedSignalEntry` interface
- Caller (SQE rejection path) writes the field
- `getSkippedSignalsSummary(days, assetClass?)` accepts optional assetClass filter
- `/api/vts/filter-diagnostics` passes `assetClass='crypto_spot'`
- `/api/xstocks/filter-diagnostics` passes `assetClass='xstock_spot'` (currently doesn't call this fn — would surface xstock skips in its own panel)
- Back-compat: existing crypto entries without the field default to `crypto_spot` when filtered

### 1.11 Asset-class log tagging

Every log line emitted from MCE / strategy detect / SQE / exit-path that doesn't currently include asset_class:
- `[B62][MCE]` lines — add `asset_class=<x>`
- `[B67.X]` macro / phase / regime lines — already include symbol; add asset_class
- `[BHF6][VTS] Strategy <X>: <message>` — already has symbol; add asset_class
- `[B73] exit ablation` — already in DB schema; verify log lines have field

**Required action for B79.0m.b:**
- Helper utility `withAssetClass(msg, assetClass)` to thread the field consistently
- Grep all `console.log/warn/error` in the shared eval chain; add helper invocation

---

## 2. xstock-side modules to build (NEW code)

### 2.1 `server/asset_classes/xstock_spot/global-filter.ts` (NEW, ~80 LOC)

```ts
export interface GlobalFilterResult {
  passed: boolean;
  failureReason?: string;
  // diag counters for the Filter Diagnostics panel
  counters: {
    failed_min_volume: number;
    failed_min_price: number;
    failed_history: number;
    failed_market_cap: number;
    failed_max_bid_ask_spread: number;
    failed_guardrail_risk: number;
    failed_correlation: number;
    already_active: number;
    passed_all_filters: number;
  };
}

export async function evaluateXstockGlobalFilter(
  symbol: string,
  ohlc: OHLCData[],
  ticker: TickerSnapshot,
  config: ScreenerFilters, // resolved via getScreenerFilters({mode, assetClass:'xstock_spot'})
): Promise<GlobalFilterResult> {
  // Check each applicable gate; N/A gates (stablecoin, quote_currency, market_cap)
  // skip with applicable=false marker in counters
  // Return pass/fail + reason + counter deltas
}
```

### 2.2 `server/asset_classes/xstock_spot/imf-evaluator.ts` (NEW, ~120 LOC)

```ts
export async function evaluateXstockFamilyIMF(
  symbol: string,
  ohlc: OHLCData[],
  family: 'trend' | 'reversal' | 'breakout' | 'oscillator' | 'strong_trend' | 'pattern',
  mode: 'paper' | 'live',
): Promise<IMFResult> {
  // Resolve family thresholds via getScreenerFilters({mode, filterPath:`vts_${family}` or `active_${family}`, assetClass:'xstock_spot'})
  // Compute LQ, VN, DI metrics from ohlc (existing imf-metrics.ts functions)
  // Apply thresholds; return pass/fail + counter deltas
}
```

### 2.3 `server/asset_classes/xstock_spot/eval-cycle.ts` (NEW, ~150 LOC)

The orchestrator. Called from `xstockSpotScanner.runCycle` for each fresh pair (50-pair batches, full sweep every 2.5 min). Pseudo:

```ts
export async function evaluateXstockPairForVTS(
  symbol: string,
  ohlc: OHLCData[],
  ticker: TickerSnapshot,
): Promise<void> {
  // 0. Market-hours gate
  if (!isXstockMarketOpenUTC(symbol)) return;

  // 1. Global filter
  const globalResult = await evaluateXstockGlobalFilter(symbol, ohlc, ticker, globalConfig);
  if (!globalResult.passed) { recordCounter(); return; }

  // 2. Family-IMF (for each enabled family path for the regime)
  for (const family of ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend', 'pattern']) {
    const imfResult = await evaluateXstockFamilyIMF(symbol, ohlc, family, mode);
    if (!imfResult.passed) continue;

    // 3. Survivor — feed into shared post-filter chain
    const context = await mce.computeContext(symbol, ohlc, ticker.last, volume24h, undefined, undefined, 'xstock_spot');
    //                                                                                            ^^^ propagatedDbs=undefined → synthesized
    //                                                                                                            ^^^ NEW assetClass param

    for (const strategy of getEligibleStrategiesForRegime(context.regime, 'xstock_spot')) {
      const signal = callStrategyDetect(strategy, indicators, ohlc, patternInput, symbol, 'xstock_spot');
      if (!signal) { logNullReason(); continue; }

      const sqeResult = await evaluateSignalQuality({
        symbol, strategy, assetClass: 'xstock_spot',
        ...signal, context,
      });

      // Persist signal_eval_archive
      await archiveSignalEval({ ..., asset_class: 'xstock_spot', ... });

      if (sqeResult.passed) {
        // Open VTS trade
        await openVtsTrade({ ..., assetClass: 'xstock_spot', ... });
      }
    }
  }
}
```

### 2.4 `xstockSpotScanner.runCycle` integration (`scanner.ts`, ~30 LOC)

After the freshness gate (line 290), iterate fresh pairs (50 per cycle, round-robin), call `evaluateXstockPairForVTS` for each.

### 2.5 Counter telemetry plumbing

`xstockSpotScanner` accumulates counters per cycle (per-stage rejection counts). `/api/xstocks/filter-diagnostics` reads these (already wired post-B79.0i.a; just need to populate from the new counters instead of always-zero).

---

## 3. Schema + seed migrations

### 3.1 `trailing_exit.xstock_spot` full row set (NEW)

UPDATE existing `break_even_enabled` to `true` + INSERT rows for `target_lock_r`, `trail_distance_atr_multiplier`, `break_even_trigger_r`, moonbag knobs.

### 3.2 `module_constants.regime_classifier` — author remaining 4 regime branches for xstock (RBS/IE/HVU/ST volatility/momentum scales)

### 3.3 `module_constants.strategy.<name>` — author xstock-explicit rows for the 9 non-ORB strategies' volatility-sensitive thresholds

### 3.4 `vts_skipped_signals` log schema — add `asset_class` field; updater function backward-compatible

---

## 4. Verification gates

| Gate | Acceptance |
|---|---|
| **G1 CI** | Build + Docker green; new b79-0m-b unit tests green; legacy red baseline unchanged. |
| **G2 DB seeds** | All new rows confirmed via psql: trailing_exit xstock full set, regime_classifier 4 remaining regimes, strategy.<name> xstock-explicit rows for the 9 non-ORB strategies. `last_updated_by='b79.0m.b-layer1-starter-equity-baseline'`. |
| **G3 PM2 logs** | Boot clean. Scanner cycle now emits `[B79.0m.b][EVAL] symbol=<x> assetClass=xstock_spot regime=<r> result=<pass/fail/signal>` per pair evaluated. |
| **G4 xstock VTS flowing end-to-end** | `signal_eval_archive` accumulates `asset_class='xstock_spot'` rows within first hour (any pair fires; ORB likely first during US RTH). `vts_open_trades` has xstock entries when any strategy fires. **At least one xstock trade opens AND closes cleanly within 24h** (Langston rev2 blast-radius #1). |
| **G5 TEC differentiation verified** | Direct test: `resolveTECConfig('crypto_spot').breakEvenEnabled === false`; `resolveTECConfig('xstock_spot').breakEvenEnabled === true`. First xstock trade close logs `[BHF3] break_even_stop` (BE armed). |
| **G6 Filter Diagnostics tab isolation** | Crypto Filter Diagnostics tab shows ZERO xstock rows. xStocks tab shows ONLY xstock data. `getSkippedSignalsSummary` filters by asset_class. Banner removed from xStocks tab. |
| **G7 Crypto no-touch fence** | All 10 factor families × 7-8/hr (±10% baseline). No regression. |
| **G8 SQE distribution sanity** | xstock signal_eval_archive rows show non-degenerate finalScore distribution; null-DBS path didn't break the math. |
| **G9 Cycle duration** | Per-cycle p95 eval duration for xstock batch ≤ 1.3× crypto baseline (B79 rev7 §11 load gate). |

---

## 5. Implementation order

1. Schema migrations (trailing_exit + regime_classifier + per-strategy thresholds + skipped-signals asset_class field)
2. MCE assetClass param + conditional DBS + per-asset-class macro modifier
3. Setup-hash key fix + asset-class log tagging helper
4. `xstock_spot/global-filter.ts` + `imf-evaluator.ts` + `eval-cycle.ts`
5. `xstockSpotScanner.runCycle` integration
6. xstocks-tab.tsx banner removal
7. `getSkippedSignalsSummary` asset-class filter
8. Tests: 18-strategy null-DBS matrix + setup-hash key + exit-path xstock close + TEC differentiation
9. CI + push
10. Staging deploy + G1-G9 verification

---

## 6.LANGSTON STEP 2 RESPONSE — APPLIED REVISIONS

**APPROVED WITH REVISIONS** (Langston 2026-05-11). All 6 R-revisions applied:

- **R1 (§1.7 exit-path OHLC):** Introduce `getOHLCSourceForTrade(trade)` helper that returns the correct cache binding by `trade.assetClass` (crypto → live-pricing-adapter; xstock → `xstock_spot_ohlc_1m`-backed cache). Exit loop calls per-trade. Unit test covers BOTH branches.
- **R2 (§1.3 enablement matrix):** post-B79.0m.a, all 10 xstock_spot strategies are gated enabled=true (vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift, orb). Verified DB seed. All 9 non-ORB get threshold authoring per §1.3.
- **R3 (§4 G4 false-fail guard):** "At least one xstock VTS trade opens AND closes cleanly within 24h **OR synthetic trade injection confirms exit path executes end-to-end with `paper_sim_trades` row written with `asset_class='xstock_spot'`**." Prevents quiet-market false-fail.
- **R4 (§4 G9 measurement):** "Cycle" = `xstockSpotScanner.runCycle` entry to last-pair-processed p95. "Crypto baseline" = phase-10 vts-runner cycle p95 over trailing 7 days pre-deploy. Window = first 48h on staging. Acceptance: xstock p95 ≤ 1.3× crypto baseline p95.
- **R5 (§1.1 MCE signature):** Positional `assetClass` param with default acceptable for back-compat. RUNNING_ISSUES follow-up: refactor computeContext to options-object signature when crosses 8+ params; not in this batch.
- **R6 (§2.4 batching):** Confirmed — process ALL fresh pairs per cycle (no batching, no new round-robin state). Matches existing xstockSpotScanner.runCycle behavior. If perf becomes an issue post-deploy (G9 fails), batching is a future-batch optimization. Crypto VTS already does this pattern (full eval per cycle).

**Q1-Q6 answers locked:**

- **Q1 DBS:** Synthesize neutral `{score:0, slope:0, category:'NEUTRAL'}` for non-crypto. Crypto's hard-fail on missing propagatedDbs PRESERVED when assetClass==='crypto_spot'. Per-asset-class DBS deferred to future Layer-3 batch (RUNNING_ISSUES candidate).
- **Q2 Macro modifier:** Per-asset-class via `module_constants.mce_config.<assetClass>.macro_modifier` for non-crypto; crypto stays on `macroCachedContext.modifier.value`. RUNNING_ISSUES follow-up to unify (not in this batch).
- **Q3 Per-strategy thresholds:** Volatility-sensitive only (~30-50 rows). Wildcard-keep for scale-free pattern geometry. Where halving rule is non-obvious (e.g. volume thresholds since crypto $-volume ≠ equity share-volume), add `notes` row justification.
- **Q4 TEC starters:** Fresh equity-context. R-based knobs (BE trigger R, target lock R, moonbag R-thresholds) — same values as crypto pre-K (R is dimensionless). ATR-multiplier knobs (trail distance) — 0.8× crypto pre-K (equity still needs noise room, just less than crypto). All rows tagged `updated_by='b79.0m.b-layer1-starter-equity-baseline'`.
- **Q5 Skipped-signals filter:** Single log directory + asset_class field + reader filter. Missing-field entries default to crypto_spot.
- **Q6 Sequencing:** Confirmed sequential. B79.0n drafts after B79.0m.b passes G1-G9.

## 7. Open questions for Langston

**Q1.** DBS handling: synthesize neutral `{score:0, slope:0, category:'NEUTRAL'}` for non-crypto asset classes per §1.1(A), OR add a per-asset-class DBS computation surface in this batch? Lean **synthesize neutral** — DBS computation for xstock can be a future batch driven by Layer-3 evidence.

**Q2.** Macro modifier per-asset-class resolution per §1.1(B): use `module_constants.mce_config.<assetClass>.macro_modifier` for non-crypto + keep `macroCachedContext.modifier.value` for crypto. Crypto path unchanged. Acceptable, or do you want unified DB-driven resolution for both (would require crypto's macro feed to also write to module_constants)?

**Q3.** Per-strategy threshold authoring scope per §1.3: 9 non-ORB strategies × ~10-19 thresholds each = up to 170 rows if everything authored xstock-explicit. Lean: author only volatility-sensitive thresholds (~30-50 rows), wildcard-keep the rest with inline justification. Acceptable?

**Q4.** TEC enablement per §1.6 + Kyle directive: xstock_spot BE=true, trailing=true. Starter values for new rows — clone crypto's last-good-with-BE values pre-Variant-K, OR fresh equity-context starters? Lean fresh equity-context (tighter trail distance per equity ATR baseline).

**Q5.** Skipped-signals asset-class filter per §1.10: add field to log entry + update reader to filter by assetClass. Crypto entries without the field default to `crypto_spot`. Acceptable, or do you want a separate log directory per asset class?

**Q6.** Sequencing vs B79.0n: B79.0n active-trading wire-in drafts AFTER B79.0m.b ships + verifies. Confirmed.

Reply: APPROVED + answers to Q1-Q6 OR numbered revisions. Target: one round to consensus per Kyle directive.

---

*End BATCH_79_0m_b_PRE_AUDIT.md.*
