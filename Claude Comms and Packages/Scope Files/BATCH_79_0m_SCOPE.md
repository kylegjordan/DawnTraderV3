# BATCH 79.0m — Wire xstockSpotScanner through the VTS pipeline + author missing thresholds

> **Status:** AWAITING LANGSTON STEP 1 REVIEW
> **Author:** Claude Code
> **Created:** 2026-05-11
> **Resolves:** RUNNING_ISSUES #92 (was mis-deferred to Phase 19)
> **Sequencing:** **TOP PRIORITY — IMMEDIATE NEXT BATCH** per Kyle directive 2026-05-11. B79.3 (macro modifiers) + B79.0n (active-trading wire-in) sequence after.

---

## 🚨 PREVIOUSLY-STATED-VS-NOW (mandatory deltas section per new CLAUDE.md §9 rule)

| Topic | Previously stated | Now | Reason |
|---|---|---|---|
| xstock_spot VTS pipeline status | "ORB signals flow through VTS shadow-mode Monday 14:30 UTC" (B79.0d completion report line 104) | **NOT FUNCTIONAL — never wired.** Scanner does freshness gate + telemetry only; line 292 has `TODO B79.x: route fresh pairs into signal-orchestrator / strategy-engine`. Zero xstock rows in `signal_eval_archive` lifetime. | B79.0a's "Day 1 = observability only" punt was never explicitly surfaced as a delta from B79 scope's "shadow-mode VTS emission" — pre-audits at each subsequent batch (.0c .0d .0f .0g .0i.a .0i.b .0j) didn't catch that the routing was still TODO. |
| xstock_spot strategy count | "6 well-understood quant strategies" (B79_0b_diff.txt line 95) | **10 strategies** = 6 quant + 3 file-based pattern + 1 ORB. | Langston rev 5 + PIA round-2 Q3 regime-compatibility appendix (2026-05-08) added 3 pattern strategies. ORB added in B79.0d (2026-05-09). Expansion from 6 → 9 → 10 was technically defensible but never explicitly surfaced as a delta. |
| RUNNING_ISSUES #92 status | "DEFERRED to Phase 19 prerequisite" (2026-05-10) | **REPRIORITIZED to immediate next batch.** | The Phase 19 deferral framing was self-contradictory: VTS observation is independent of active trading, and Layer-3 evidence Phase 19 keys off REQUIRES the VTS pipeline to actually run for xstocks. |

---

## 1. Why this batch + what's actually missing

**Two distinct gaps, both should have been caught in B79 scope/pre-audit:**

### Gap A — VTS pipeline routing not wired
- `server/asset_classes/xstock_spot/scanner.ts:292` explicit `TODO B79.x: route fresh pairs into signal-orchestrator / strategy-engine`
- `server/services/vts-runner.ts` autonomous-simulation loop pulls pairs from `getIdealPoolPairs()` (line 2545, code-comment: "the SOLE pair source for VTS") — crypto-only by construction
- Zero xstock entry points exist in `vts-runner.ts`
- DB evidence: `signal_eval_archive` lifetime xstock rows = 0; `vts_open_trades` all crypto

### Gap B — Threshold authorship incomplete for xstock_spot

**Authored (✅):**
- `screener_filters` 1 row (paper mode, no filter_path): min_volume=$100k, min_price=$1, max_price=NULL, min_market_cap=$100M, max_bid_ask_spread=1.00, exclude_stablecoins=false, min_liquidity=$50k, universe_size=50
- `module_constants` xstock_spot rows: `data_freshness_window_ms=90000`, `mce_config.macro_modifier=1.0` (placeholder, B79.3 owns), `pattern_pool_gates {final_score_floor=0.45, max_position_pct=0.50}`, `sqe_config` 6 thresholds, `strategy_gates.orb.enabled=true`, `strategy.orb` 7 thresholds, `trailing_exit.break_even_enabled=false`

**Missing (❌):**
- `screener_filters` family-IMF rows for xstock (filter_path: vts_trend / vts_reversal / vts_breakout / vts_oscillator / vts_strong_trend, both paper + live modes). Crypto has 5 family rows × 2 modes; xstock has 0. Without these, fx5-scanner emits `[BATCH34][CONFIG_MISSING] family IMF filtering will be SKIPPED`.
- `screener_filters` row for `mode=live` (only `mode=paper` exists today)
- `module_constants` regime-classifier asset-class-explicit rows where crypto values genuinely don't fit equity microstructure (`regime_classifier` ATR/momentum scales, `volume_regime`, `regime_age`, `multi_tf_agreement`, `path_b_sustainability`)
- `module_constants` per-strategy threshold rows for the 9 strategies beyond ORB (currently all wildcard = crypto-tuned values)
- `module_constants.strategy_gates` rows for the 9 strategies beyond ORB (currently gated by hardcoded `XSTOCK_SPOT_ENABLED_STRATEGIES` constant in `canonical-regime-strategy-map.ts:910` — should be DB rows for tunability without redeploy)

---

## 2. Numbered objectives

### Phase A — Threshold authoring (must precede wiring, otherwise wired pipeline runs with wildcards = crypto values, contaminating Layer-3 evidence)

1. **5 family-IMF rows × 2 modes = 10 rows** in `screener_filters` for `asset_class='xstock_spot'`. Filter paths: `vts_trend`, `vts_reversal`, `vts_breakout`, `vts_oscillator`, `vts_strong_trend` (paper) + `active_*` equivalents (live). Each row populates LQ_MIN, VN_MAX, DI_MIN, DI_MAX. **Starter values derived from B74 archive** — 3 months of xstock_spot OHLC and ticker data — using crypto's family thresholds as initial reference but halved on volatility-related fields (VN_MAX) since equity ATR is roughly half crypto ATR. Documented as Layer-1 starter; Layer-3 calibrates from xstock VTS evidence post-wire.

2. **`screener_filters` `mode=live` row** for xstock_spot — mirror of the existing `paper` row. (Active trading is OFF, but the row needs to exist so the schema-consistency invariant holds and so B79.0n active-wire batch doesn't trip on a missing row.)

3. **Asset-class-explicit regime classifier rows** in `module_constants` for xstock_spot where crypto values genuinely don't fit equity microstructure. Specifically:
   - `regime_classifier.b67_3_5_tfs_momentum_scale` — crypto value 0.020 → xstock starter 0.010 (equity momentum ranges roughly half crypto)
   - `regime_classifier.b67_3_5_tfs_volatility_scale` — crypto value 0.025 → xstock starter 0.0125
   - Equivalent rows for the RBS / IE / HVU / ST regime branches (5 regimes × ~5 fields each ≈ 25 rows)
   - `volume_regime` (B68.2) — `b68_2_lookback_bars`, `b68_2_min_samples`, `b68_2_sensitivity` — review per regime; many likely fine on wildcard (math is regime-relative not asset-class-absolute) but volatility-related thresholds need xstock-specific starters
   - `regime_age` (B68.4) — likely fine on wildcard (age math is asset-class-agnostic)
   - `multi_tf_agreement` (B68.1) — review per Langston call
   - `path_b_sustainability` (B68.5) — `b68_5_path_b_momentum_min` crypto 0.001 → xstock 0.0005
   - `directional_integrity` + `dbs_calculation` — KEEP wildcard (math is asset-class-agnostic primitive)

   **Documentation discipline:** every wildcard row that stays wildcard for xstock gets an inline comment in the seed SQL stating "intentional wildcard — formula is asset-class-agnostic" so future auditors don't re-debate it.

4. **9 per-strategy threshold rows** for the strategies enabled on xstock beyond ORB. For each: review wildcard values, decide keep-as-wildcard vs author-xstock-explicit row. Lean: most ATR-multiplier-based thresholds need halving for equity vs crypto. Some (e.g. `range_trade.touch_count_min`) are asset-class-agnostic.
   - `vwap_pullback` — author xstock rows for any ATR-multiplier thresholds
   - `breakout` — author xstock rows for ATR-buffer thresholds + min-range thresholds
   - `mean_reversion` — review, likely keep wildcard
   - `range_trade` — review, likely mostly wildcard except range-width thresholds
   - `sma_trend_ride` — author xstock rows for trend-strength thresholds
   - `vwap_bounce` — author xstock rows for distance-from-vwap thresholds
   - `inside_bar_reversal` — review pattern, likely keep wildcard (pattern math is scale-free)
   - `morning_star` — review pattern, likely keep wildcard
   - `pivot_shift` — review pattern, likely keep wildcard
   - **`orb` already has 7 xstock-explicit rows** (no work needed)

5. **Move `XSTOCK_SPOT_ENABLED_STRATEGIES` from code to DB** — 9 new rows in `module_constants.strategy_gates`: `strategy_gates.xstock_spot.<strategy>.enabled=true` for the 9 strategies beyond ORB. Keep the code constant as a fallback-or-runtime-cross-check (TBD with Langston — Q1 below). This makes the strategy whitelist tunable without redeploy.

### Phase B — VTS pipeline wiring

6. **Carve out shared eval entry point** in `vts-runner.ts`:
   ```ts
   export async function evaluatePairForVTS(input: {
     symbol: string;
     assetClass: AssetClass;
     ohlc: OHLCData[];
     indicators: Indicators;
     regimeCtx: RegimeContext | null;  // null for xstock Day 1 — see Q4 DBS asymmetry rider
   }): Promise<{ /* counter deltas, signal/null outcome */ }>
   ```
   The function body is everything from "global filter check" through "MCE / IMF / strategy detect / SQE / persist" extracted from `runPhase10SimulationCycle` (~750 LOC body around line 2513). Crypto's autonomous-simulation loop becomes a wrapper that pulls crypto pairs from `getIdealPoolPairs()` and calls `evaluatePairForVTS` per pair.

7. **xstockSpotScanner integration.** In `xstock_spot/scanner.ts` after the freshness gate (line 290+), iterate the fresh-pair list — **50 pairs per cycle, round-robin through the 265-pair xstock universe; full-universe sweep every 5 cycles ≈ 2.5 min** — fetch per-pair OHLC slice (from `xstock_spot_ohlc_1m` archive, per-strategy-declared-min-bars lookback per Langston rev1 Q3 rider) + indicators, call `evaluatePairForVTS(..., assetClass='xstock_spot', regimeCtx=null)`.

8. **5 blast-radius items from Langston rev1+rev2:**
   - **DBS asymmetry:** `evaluatePairForVTS` accepts `regimeCtx: RegimeContext | null`; xstock passes `null`; downstream multipliers treat `null` as neutral (multiplier=1.0). Grep all 18 strategies to confirm each handles `dbs === null` as neutral; document in SQE math notes. Add unit test asserting null-DBS path doesn't break SQE FinalScore distribution.
   - **defensive_hedge BTC-ref guard:** add `if (assetClass !== 'crypto_spot') return null;` guard at the entry of `detectDefensiveHedge` — positive allowlist preferred over blocklist. Add inline TODO comment for future asset-class additions.
   - **Setup-hash key collision fix:** change global `lastSetupHash` Map key from `${symbol}:${strategy}` → `${assetClass}:${symbol}:${strategy}`. Mandatory regardless of wiring direction — silent cross-asset collision risk.
   - **VTS exit-path asset-class cleanliness:** Langston rev2 §"blast-radius #1" — once xstock rows exist in `vts_open_trades`, the exit evaluator must pull fresh OHLC from `xstock_spot_ohlc_1m` (not crypto_spot table), compute PnL with xstock-appropriate precision (no implicit crypto-symbol-format assumption), and write closure rows correctly. **Verification gate:** at least one xstock trade opens AND closes cleanly during the 24h forward-watch before claiming verified.
   - **Asset-class log tagging:** every log line + metric emitted from the shared eval body must include the `asset_class` field/tag so crypto vs xstock counters don't conflate in telemetry.

9. **`_resolvedAssetClass` fallback verification** — `vts-runner.ts:1027` does `safeResolveAssetClass(symbol, 'kraken') ?? 'crypto_spot'`. Verify XSTOCK_SPOT_SYMBOLS resolver entries are complete BEFORE wiring (B79.0f collision work should have handled this — sanity-check). If any xstock symbol falls back to `'crypto_spot'`, friction/regime/SQE lookups would silently pollute with crypto defaults.

### Phase C — Diagnostic endpoint fixes

10. **Drop the misleading labels in `routes.ts:7036-7159`** (`/api/xstocks/filter-diagnostics`):
    - Remove the `passed_all_filters: universe24h` mis-wiring — `universe24h` is `COUNT(DISTINCT symbol) FROM xstock_spot_ticker_snap`, not a filter-pass count. Once orchestration runs, this field should populate from real `signal_eval_archive` counts.
    - Rename "Universe Scanned" column to "Ticker Snaps (24h)" since 322,985 is row count of archived ticker snaps, not pipeline pass count. OR populate "Universe Scanned" from real `signal_eval_archive` evaluated_count.
    - **N/A column** in Filter Diagnostics for the 3 N/A gates (stablecoin / quote_currency / market_cap) per Langston rev2 Q2 rider — silent PASS would distort the funnel display.

### Phase D — Governance

11. **Add to CLAUDE.md §9 (in same batch governance commit):**
    - **Bold-font scaffolding rule:** any sub-batch that ships scaffolding without making it functional MUST state at the top of the completion report: `🚨 THIS BATCH DOES NOT MAKE <CAPABILITY> FUNCTIONAL. <CAPABILITY> WILL REMAIN INERT UNTIL <BATCH N+x>.`
    - **Numeric-deltas rule:** any change to a previously-stated number (strategy count, threshold, sub-batch count, LOC, sequencing day) MUST be surfaced in the next communication as "**PREVIOUSLY STATED: X. NOW: Y. REASON: <one line>.**" Pre-audit + completion reports must include a "Numeric deltas vs prior commitments" section.

12. **Close RUNNING_ISSUES #92 + open #99 B79.0n tracker** for active-trading wire-in (follows B79.0m; cannot end-to-end test without active trading on, but wiring + asset-class plumbing + signal-orchestrator dispatch path verifiable up to the Phase 19 gate).

---

## 3. Non-objectives + invariants

- **No changes to active-trading path** — that's B79.0n. This batch wires VTS only. Signal-orchestrator + paper-execution-engine + size-and-orchestrate are NOT touched.
- **No changes to B73 ablation, B70 archive, ML calibration triggers** — they consume from `signal_eval_archive` / `vts_open_trades` which this batch starts populating for xstock; no contract changes.
- **Crypto regression: NONE by-construction.** The eval body extraction is parameterized on `assetClass`; crypto path remains identical (same `getIdealPoolPairs()` → call `evaluatePairForVTS(..., 'crypto_spot', ...)` wrapper). Verified by no-touch fence query at G5.
- **No threshold tuning beyond Layer-1 starters.** Layer-3 calibration happens post-wire as ablation evidence accumulates. Document every starter value as "Layer-1 starter, Layer-3 calibrates."

---

## 4. Verification gates (Step 7)

| Gate | Acceptance |
|---|---|
| **G1 CI** | Build + Docker green; new b79-0m unit tests green; legacy red baseline unchanged. |
| **G2 schema + seeds** | `\d screener_filters` unchanged; new xstock family-IMF rows present (5 × 2 modes = 10 rows). All Phase A `module_constants` rows present via SELECT. New `strategy_gates` rows for the 9 strategies present. |
| **G3 PM2 logs** | Boot logs clean: `[B79.0g][REHYDRATE]`, `[B79.0g-tx][GC_SWEEP]`. Scanner cycle logs include xstock-tagged `[B79.0a][SCAN_CYCLE_DONE]` lines. NEW: `[B79.0m][EVAL]` log lines per pair evaluated with `asset_class=xstock_spot` tag. Zero `[BATCH34][CONFIG_MISSING]` family-IMF lines for xstock_spot. Zero `[HF6][VTS] Strategy orb returned null` spam (now properly guarded). |
| **G4 DB state — xstock VTS flowing** | `SELECT asset_class, COUNT(*) FROM signal_eval_archive WHERE captured_at > NOW() - INTERVAL '1 hour' GROUP BY asset_class` returns BOTH `crypto_spot` (existing) AND `xstock_spot` (new, non-zero). Within 24h: `vts_open_trades WHERE asset_class='xstock_spot' AND closed=false` has ≥1 entry (any strategy fires; ORB likely first during US market hours). At least one xstock trade opens AND closes cleanly (Langston rev2 blast-radius #1). |
| **G5 crypto no-touch fence** | `SELECT factor_name, COUNT(*) FROM regime_factor_alternates WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour' GROUP BY factor_name` — counts within ±10% of pre-deploy baseline (10 factor families × 8/hr ≈ 80/hr total). |
| **G6 Filter Diagnostics honesty** | xStocks tab Filter Diagnostics panel shows real non-zero IMF / family / SQE / strategy-eval counts (not the misleading 380 from ticker_snap COUNT DISTINCT). N/A column visible for the 3 non-applicable gates. |
| **G7 SQE distribution sanity** | xstock pair `signal_eval_archive` rows show non-degenerate `finalScore` distribution (not all 0, not all max). Confirms null-DBS path didn't break SQE math. |
| **G8 cycle duration** | Per-cycle p95 eval duration for the xstock batch ≤ 1.3× crypto baseline (B79 rev7 §11 load gate). |

---

## 5. Open questions for Langston

**Q1.** `XSTOCK_SPOT_ENABLED_STRATEGIES` migration: keep the code constant as a defense-in-depth cross-check after DB rows are seeded, OR delete the code constant entirely once DB rows are authoritative? Lean **keep + add boot-time assertion** that DB rows exactly match the code constant — catches drift either direction.

**Q2.** Per-strategy threshold authoring scope: for each of the 9 strategies (vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift), I propose to review each strategy's wildcard rows and decide row-by-row whether to author xstock-explicit row vs keep wildcard. This is the largest single piece of Phase A work — maybe 20-50 SQL rows depending on calls. Reasonable, or do you want me to lean toward wildcard-keep + Layer-3-evidence-driven authoring later?

**Q3.** Batch size at the carve-out: my pre-audit estimate is **400-550 LOC** (up from rev2's 200-300 because of Phase A threshold authoring SQL + Phase C diagnostic endpoint refactor). Approaching the 500 LOC ceiling you flagged in rev2. Should I:
- (a) Single batch, split at pre-audit if it bulges past 600 LOC
- (b) Split now into B79.0m.a (Phase A threshold authoring + Phase C diagnostic) + B79.0m.b (Phase B wiring + Phase D governance)
- (c) Split now differently

**Q4.** OHLC pre-fetch in `evaluatePairForVTS`: rev1 Q3 you specified per-strategy-declared-min-bars not flat 5-min. Concrete plan: read each strategy's `min_bars` from its registry entry (need to confirm the registry has this — if not, surface as a sub-objective), compute max across strategies enabled for the regime, fetch that slice from `xstock_spot_ohlc_1m` per pair per cycle, cache within cycle. Within-cycle cache pattern OK or do you want a longer TTL?

**Q5.** Asset-class log tagging implementation: add `assetClass` as a structured field to every `console.log`/`console.warn` call in the new shared eval body, OR introduce a thin logging-helper that auto-injects from the eval context? Lean helper for consistency + grep-ability.

**Q6.** Sequencing vs B79.0n active-trading wire-in: I'm proposing B79.0m ships and verifies, then B79.0n is a separate scope drafted after B79.0m closes. Confirm vs parallel-track.

**Q7.** Q3 N/A column in Filter Diagnostics — does the existing FilterDiagnosticsData type schema support a per-gate `applicable: boolean` field, or do we need a schema lift? If a schema lift, that's in scope for this batch (touching analytics.tsx + machine-learning.tsx).

---

## 6. Scope sequencing

Pending Langston Q1-Q7 answers:
- **Single batch (Q3 option a):** ~400-550 LOC. One Step-1 scope review → one Step-2 pre-audit review → implementation → Step-4 code review → deploy.
- **Split (Q3 option b):** B79.0m.a (~200 LOC, no behavior change — pure threshold + diagnostic seeding) ships first; B79.0m.b (~300 LOC carve-out + wiring) ships second.

---

## 7. Governance touch list

- `BATCH_CATALOG.md` — B79.0m row
- `PHASE_HISTORY.md` — Phase 24 sub-batch table extended
- `RUNNING_ISSUES.md` — #92 RESOLVED + #99 NEW (B79.0n active-trading-wire follow-on)
- `SYSTEM_IMPACT_MAP.md` — `vts_open_trades` consumer surface updated + new `evaluatePairForVTS` entry-point entry + xstock-spot pipeline diagram refresh
- `SYSTEM_MANUAL.md` — Phase 24 standing rules appendix updated with the two new CLAUDE.md §9 rules
- `CLAUDE.md` — §9 gets the bold-font scaffolding rule + numeric-deltas rule
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — Section H.1.x updated with the actual wiring decision (current text incorrectly implies xstock is wired)
- `CHANGES_AND_FIXES.md` — entry for B79.0m ship + the two new standing rules
- MEMORY.md 3-way sync per CLAUDE.md §2 Step 10.b
- `Claude Comms and Packages/Scope Files/BATCH_79_0m_SCOPE.md` (this file)
- `Claude Comms and Packages/Scope Files/BATCH_79_0m_PRE_AUDIT.md` (Step 2)
- `Claude Comms and Packages/Change Lists/B79_0m_diff.txt` (Step 4)
- `Claude Comms and Packages/Batch Completion/BATCH_79_0m_COMPLETION_REPORT.md` (Step 11)

---

*End BATCH_79_0m_SCOPE.md.*
