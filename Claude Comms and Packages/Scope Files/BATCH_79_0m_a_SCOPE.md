# BATCH 79.0m.a — Threshold authoring + Diagnostic fixes + Governance rules (split half 1 of 2)

> **Status:** Step 1 implicitly approved via parent `BATCH_79_0m_SCOPE.md` Langston review 2026-05-11.
> **Author:** Claude Code
> **Created:** 2026-05-11
> **Parent:** `BATCH_79_0m_SCOPE.md` (Q3 split → .a and .b per Langston)
> **Sequencing:** Ships first; **NO BEHAVIORAL CHANGE TO XSTOCK VTS EVAL PATH** — rows inert until .b lands the wiring.

## 🚨 PREVIOUSLY-STATED-VS-NOW

This batch's threshold authoring inverts the prior implicit assumption that xstock_spot would resolve via `*` wildcard rows. Per Langston Q2 (Step 1 review): wildcard-keep requires inline-comment justification; xstock-explicit is the default per CLAUDE.md §8 #11.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (new §9 rule applied to this batch)

**THIS BATCH DOES NOT MAKE XSTOCK VTS EVALUATION FUNCTIONAL. XSTOCK PAIRS REMAIN INERT IN THE VTS PIPELINE UNTIL B79.0m.b SHIPS.**

This batch seeds the configuration data + diagnostic surfaces + governance rules that B79.0m.b will then activate by carving out `evaluatePairForVTS` and integrating it into `xstockSpotScanner.runCycle`.

## Numbered objectives

### Phase A — Threshold authoring

1. **Family-IMF rows** in `screener_filters` for `asset_class='xstock_spot'`: 5 family paths × 2 modes = **10 rows**. Filter paths: `vts_trend` / `vts_reversal` / `vts_breakout` / `vts_oscillator` / `vts_strong_trend` (mode=paper) + `active_*` equivalents (mode=live). Each row populates `lq_min`, `vn_max`, `di_min`, `di_max`. Starter values:
   - Cribbed from crypto's family rows + halve any volatility/noise-driven thresholds (`vn_max`) for equity vs crypto microstructure
   - Tagged `last_updated_by='b79.0m.a-layer1-starter'` so future audits can locate them

2. **`screener_filters` mode=live row** for xstock_spot — mirror of existing paper row. (Active trading off; row needed for schema-consistency invariant.)

3. **Regime classifier asset-class-explicit rows** in `module_constants` (xstock_spot). Surfaces touched: `regime_classifier`, `regime_phase`, `volume_regime`, `regime_age`, `multi_tf_agreement`, `path_b_sustainability`. Starter rule: any threshold expressed in absolute volatility/momentum/return-magnitude units → author xstock-explicit row at HALF crypto value (matches Layer-1 equity-ATR-is-half-crypto-ATR baseline). Any threshold that's a ratio / count / regime-relative scale → keep wildcard with inline justification comment.
   - Expected ~15-25 xstock-explicit rows
   - `directional_integrity` + `dbs_calculation` + `outcome_feedback` + `pair_correlation` + `multi_tf_agreement` formula primitives KEEP wildcard (math is asset-class-agnostic; document inline)

4. **Per-strategy threshold rows** for the 9 strategies enabled on xstock beyond ORB. For each: review wildcard values, decide row-by-row (xstock-explicit is the default per Langston Q2; wildcard-keep needs inline justification). Strategies:
   - `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce` (6 quant)
   - `inside_bar_reversal`, `morning_star`, `pivot_shift` (3 pattern)
   - Pattern detectors are typically scale-free (bar-shape geometry not ATR-amounts) — lean wildcard-keep
   - Quant strategies with ATR-multiplier or absolute-momentum thresholds — author xstock rows halving volatility-related values
   - Expected ~20-30 xstock-explicit rows total

5. **Migrate `XSTOCK_SPOT_ENABLED_STRATEGIES` from code to DB.** Per Langston R1 (Step 1): **delete the code constant entirely; DB authoritative.** Action:
   - Author 9 new `module_constants.strategy_gates.xstock_spot.<strategy>.enabled=true` rows (orb already exists)
   - Add boot-time assertion to `server/services/asset-class-instances.ts` (or equivalent boot path): verify all 10 xstock strategy gates have explicit DB rows; HARD-FAIL boot if any missing. Pattern mirrors B79.TEC's `primeXConfig` HARD-FAIL boot.
   - Update `isStrategyEnabledForAssetClass` in `canonical-regime-strategy-map.ts:940` to read from DB via `module_constants.strategy_gates.<assetClass>.<strategy>.enabled` lookup, NOT the deleted code Set
   - **Delete** `XSTOCK_SPOT_ENABLED_STRATEGIES` const declaration
   - **Delete** related unit test `whitelistedCount === 10` and replace with DB-driven equivalent assertion
   - Note in inline doc that crypto_spot remains default-open via the existing back-compat behavior (no DB rows needed for crypto)

6. **`min_bars` registry formalization** (sub-objective per Langston Q4). Audit the 10 enabled-for-xstock strategies for whether their strategy registry entry declares `min_bars` (or equivalent OHLC-history requirement). For any strategy missing this declaration, add it explicitly at the registry/constants level. B79.0m.b's within-cycle OHLC pre-fetch uses `max(min_bars over enabled strategies for the pair's regime)`.

### Phase C — Diagnostic endpoint fixes

7. **`routes.ts:7036-7159` xstocks filter-diagnostics endpoint:**
   - Remove `passed_all_filters: universe24h` mis-wiring (universe24h is `COUNT(DISTINCT symbol) FROM xstock_spot_ticker_snap`, NOT a filter-pass count)
   - Rename UI "Universe Scanned" column to **"Ticker Snaps (24h)"** since the source is archive row count, not pipeline pass count
   - Add `applicable: boolean` per-gate field to `FilterDiagnosticsData` (schema lift if needed — confirmed by Step 2 pre-audit reading the type)
   - Frontend (`xstocks-tab.tsx` via shared `FilterDiagnosticsPanel`): render N/A column for gates where `applicable=false` (the 3 N/A gates for xstock: `stablecoin`, `quote_currency`, `market_cap`)

8. **xstock-tab UI surfacing:** the "Scaffolding-vs-functional" declaration from §9 propagates to the xStocks tab header. Add a clear status banner above the FilterDiagnosticsPanel:
   - Pre-B79.0m.b: `🚨 VTS evaluation pipeline not yet wired for xstock_spot — counts will populate once B79.0m.b ships.`
   - Post-B79.0m.b: remove the banner

### Phase D — Governance rules (CLAUDE.md §9 additions)

9. **Add to `CLAUDE.md` §9:**

   **Rule SCAFFOLDING-VS-FUNCTIONAL:** Any sub-batch that ships scaffolding without making the user-facing capability functional MUST state at the top of the completion report:
   > 🚨 THIS BATCH DOES NOT MAKE <CAPABILITY> FUNCTIONAL. <CAPABILITY> WILL REMAIN INERT UNTIL <BATCH N+x>.

   The declaration must be at the TOP of the completion report in bold, separated from other content. Burying "deferred to next batch" in row N of an objectives table does not satisfy this rule.

   **Rule NUMERIC-DELTAS-MUST-BE-SURFACED:** Any change to a previously-stated number (strategy count, threshold value, sub-batch count, LOC estimate, sequencing day, verification gate count) MUST be surfaced in the next user-facing communication as:
   > **PREVIOUSLY STATED: X. NOW: Y. REASON: <one line>.**

   Pre-audit and completion reports MUST include a "PREVIOUSLY-STATED-VS-NOW" section at the top listing every prior-number → new-number delta with the decision source cited. Burying a new value in a table cell, test assertion, or seventh-paragraph parenthetical does not satisfy this rule.

10. **Update `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section H.1.x** to remove implications that xstock VTS is wired (e.g. "Persistence-at-trade-open via vts_open_trades table" — true for the schema but xstock pairs never reach the persist step until B79.0m.b). Add explicit "wiring status by surface" sub-section.

## Non-objectives

- **NO code change to `vts-runner.ts` eval body.** Carve-out is B79.0m.b.
- **NO code change to `xstockSpotScanner.runCycle` past freshness gate.** Wiring is B79.0m.b.
- **NO change to crypto behavior.** All new rows are scoped `asset_class='xstock_spot'`; crypto path unaffected.
- **NO Layer-3 calibration of starter values.** Starters are Layer-1 baselines documented as such.

## Verification gates

| Gate | Acceptance |
|---|---|
| **G1 CI** | Build + Docker green; new SQL migrations apply cleanly; deleted code constant + new DB-lookup helper compiles. |
| **G2 DB seeds present** | psql confirms 10 family-IMF screener_filters rows + ~15-25 regime classifier rows + ~20-30 per-strategy rows + 9 strategy_gates rows for xstock_spot. All `last_updated_by='b79.0m.a-layer1-starter'` so they're greppable. |
| **G3 PM2 boot logs** | Server boots cleanly; new boot-time strategy_gates HARD-FAIL assertion passes (all 10 rows present). Zero `[CONFIG_MISSING]` log lines for xstock family-IMF. No regression on rehydrate / sweep / scanner cycle markers. |
| **G4 Diagnostic endpoint** | `/api/xstocks/filter-diagnostics` returns the new shape (no `passed_all_filters: universe24h` mis-wiring; `applicable` field on each gate). |
| **G5 UI surfaces correctly** | xStocks tab on staging shows: renamed "Ticker Snaps (24h)" column, N/A column for stablecoin/quote_currency/market_cap gates, banner explaining VTS-not-yet-wired status. Verified via Claude-in-Chrome navigation. |
| **G6 Crypto no-touch fence** | `regime_factor_alternates` cadence within ±10% for `crypto_spot`. No changes to crypto strategy/eval behavior. |
| **G7 Governance rules in place** | CLAUDE.md §9 additions present; ASSET_CLASS_ONBOARDING_WORKFLOW H.1.x updated; RUNNING_ISSUES updated. |

## Sequencing

B79.0m.a ships → 24h forward-watch (G6 cadence) → B79.0m.b drafts. No parallel work.

## Open questions

(All Q1-Q7 answered at parent scope Step 1 Langston review. No new questions for .a.)

---

*End BATCH_79_0m_a_SCOPE.md.*
