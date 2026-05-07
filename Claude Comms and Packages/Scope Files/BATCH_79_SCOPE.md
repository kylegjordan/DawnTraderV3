# BATCH 79 — Xstock_spot (Kraken XStocks Pro) into VTS + active-path wire-in

**Status:** rev 2 — APPROVED by Langston (rev 1 → 2 surgical revisions + 5 Q answers applied: strategy categorization completed for missing 5 + liquidity_trap skip flag; bps/decimal unit consistency renamed `*Bps*` → `*Rate*`; TS constants for thresholds; conservative whitelist of 6 strategies; trace pair-universe filter properly now; TS hash for friction overrides; ARCA-aware weekend pause + module_constant override)
**Workflow:** 11-step canonical (full workflow — substantive new logic, not surgical fix)
**Branch:** `migration/aws-supabase`
**Trigger:** Per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §6 + Kyle no-deferrals directive 2026-05-07. Prereq B78.1 (cycle break) + B78.2 (Kraken WS v1→v2 fix) done.
**Pre-B79 HEAD:** `514b34dbd` (B78.2 governance close).
**Critical-path?** YES — first asset-class population batch in B78–B81 stretch.
**Days:** 3-5 of the 8-day stretch (target ship 2026-05-09).

---

## §1. Trigger + pre-audit findings

Per plan doc §6: xstock_spot is the first new asset class to populate the B78 modularization scaffold (`server/asset_classes/xstock_spot/`). Pre-existing infra (per Kyle confirmation 2026-05-07): Kraken XStocks pairs already scanning + archiving via B74 `equity-spot-archiver` (separate WS connection at `wss://ws-equities.kraken.com`).

**Pre-audit critical finding (CC investigation 2026-05-07):**
- `regime_factor_alternates` and `signal_eval_archive` in last 24h show **ONLY `asset_class='crypto_spot'`** rows (4,782 / 191,453 respectively). **Zero xstock_spot rows.**
- `resolveAssetClass(symbol, 'kraken')` IS called at 3 sites (`vts-runner.ts:1733`, `signal-orchestrator.ts:988`, `paper-execution-engine.ts:1149/1161`), AND XSTOCK_SPOT enum + display-form regex exist in `shared/asset-classes.ts:38, 87, 182, 228, 234`.
- Conclusion: **xStocks pairs are not reaching VTS evaluation** — either filtered out of the pair universe upstream OR not in the Kraken-pair source feed. Plan doc §6's premise ("VTS already scans xstock_spot") is **NOT operationally true today**; B79 must include investigation + unlock.

This adds Day 0.5 scope (~2-3hr) to identify and unblock the filter.

---

## §2. Numbered objectives

### §2.1 Day 0 — Per-asset-class friction extraction (folded from B78 deferral)

1. **Extract per-asset-class friction interface.** Define `AssetClassFrictionModel` in `server/asset_classes/types.ts` (NEW) with shape `{ feeBpsTaker, feeBpsMaker, slippageBpsDefault, spreadBpsDefault, maxCostBound, perPairOverrides?: Record<string, Partial<...>> }`.
2. **Populate `server/asset_classes/crypto_spot/friction.ts`** with current crypto values from `server/config/exchange-defaults.ts` (DEFAULT_TAKER_FEE 0.0026, DEFAULT_SLIPPAGE, DEFAULT_SPREAD, MAX_COST_BOUND). Re-export consumed by `server/core/math/cost-model.ts` via the asset_class-keyed lookup pattern.
3. **Refactor `cost-model.ts` to consume per-asset-class friction.** Add `assetClass` param threading through `getCostMetrics(symbol, assetClass)`. Default to `'crypto_spot'` if absent (back-compat). Resolves via the asset-class friction module's `perPairOverrides` if present, else falls back to module defaults.
4. **Scaffold xstock_spot friction stub** with TBD values populated by §2.3 Layer 1. Crypto_perp scaffold stays empty (B80 owns).

### §2.2 Day 0.5 — Unlock xstock_spot pair-universe filter (NEW per pre-audit)

5. **Investigate where xStocks pairs are filtered out of VTS scan universe.** Likely candidates: `fx5-scanner.ts`, `multi-timeframe-scanner.ts`, `kraken-asset-pairs-service.ts`, or `screener_filters` table. Trace from `krakenUniverseSize: 1530` log line down to `evaluatedCount: 362`.
6. **Unblock the filter** — likely add `OR asset_class='xstock_spot'` to whatever is gating crypto_spot only, OR ensure xStocks pairs are present in the source pair list.
7. **Verify**: post-fix `signal_eval_archive` should accumulate xstock_spot rows within 1 scan cycle (~30s).

### §2.3 Day 4 morning — Layer 1 threshold derivation (domain-knowledge baseline)

8. **Populate `server/asset_classes/xstock_spot/regime-thresholds.ts`** with named exports per crypto_spot pattern (B78). Domain-knowledge deltas:
   - `RBS_VOL_MAX_XSTOCK = 0.006` (half of crypto's 0.012 — equity ATR% is ~0.5-2% vs crypto's 2-8%)
   - `RBS_DX_MAX_XSTOCK = 35` (vs crypto 45 — equity trends weaker but more reliable; tighter ADX threshold)
   - `RBS_DBS_MAX_XSTOCK = 0.10` (same as crypto — DBS scale-invariant)
   - `IE_VOL_MIN_PATH_A_XSTOCK = 0.010` (half of crypto 0.020)
   - `IE_DX_MIN_PATH_A_XSTOCK = 40` (vs crypto 55)
   - `IE_VOL_MIN_PATH_B_XSTOCK = 0.0075` (half of crypto 0.015)
   - `IE_DBS_STRONG_XSTOCK = 0.50` (same as crypto)
   - `TFS_MOM_MIN_PATH_A_XSTOCK = 0.0015` (half of crypto 0.003)
   - `TFS_DX_MIN_XSTOCK = 35` (vs crypto 50)
   - `TFS_DBS_MODERATE_XSTOCK = 0.30` (same)
   - `HVU_VOL_MIN_XSTOCK = 0.0075` (half of crypto 0.015)
   - `HVU_MOM_NEG_PATH_A_XSTOCK = -0.0015` (half magnitude of crypto -0.003)
   - `HVU_DX_STRONG_XSTOCK = 45` (vs crypto 60)
   - `HVU_MOM_NEG_PATH_B_XSTOCK = -0.0025` (half magnitude of crypto -0.005)
9. **Wire xstock_spot thresholds into `market-regime.ts` `calculatePairRegime`** via asset_class-keyed lookup. Crypto_spot path unchanged (no-touch fence). Logic: at top of function, `if (assetClass === 'xstock_spot') use XSTOCK constants else use crypto constants`. Keeps branch logic unchanged; only thresholds vary.
10. **Seed `module_constants` rows** for xstock_spot SQE thresholds:
    - `sqe_config.di_min_quant` for `asset_class='xstock_spot'`: 18 (vs crypto 25)
    - `sqe_config.adx_min` for `asset_class='xstock_spot'`: 18 (vs crypto 25)
    - `sqe_config.momentum_min` for `asset_class='xstock_spot'`: 0.002 (scaled by ATR% ratio)
    - `sqe_config.di_min_pattern` for `asset_class='xstock_spot'`: 10 (vs crypto 10 — same)
11. **Populate `server/asset_classes/xstock_spot/friction.ts`** (per Langston rev 1 unit consistency: **fee/spread/slippage values are decimal RATES, not bps integers**; rename fields `feeRateTaker`/`feeRateMaker`/`spreadRateDefault`/`slippageRateDefault` to match. Apply same rename consistently to `crypto_spot/friction.ts` populated in obj 2 + plan doc §9 threshold table cross-ref to avoid B81 unit-confusion bug):
    - `feeRateTaker: 0.0026` (0.26%; Kraken Spot fee schedule — same as crypto for now; verify if XStocks has different fee)
    - `feeRateMaker: 0.0016` (0.16%)
    - `spreadRateDefault: 0.0012` (12 bps; mid-range of 5-15 bps spread observed for top XStocks pairs)
    - `slippageRateDefault: 0.0005` (5 bps; less than crypto's 10-15 bps due to tighter spreads)
    - `maxCostBound: 0.005` (50 bps total round-trip cap)

### §2.4 Day 4 afternoon — Layer 2 cross-asset shadow-classify

12. **Spot-check regime classification on 5 representative XStocks pairs** (AAPLx, NVDAx, MSFTx, SPYx, QQQx) using last 24h B70 archive OHLC. Read sample bars; compute `calculatePairRegime` with xstock_spot thresholds. Inspect: TFS over-fires? RBS dominates midday? Adjust thresholds in `regime-thresholds.ts` if needed (1-2 iterations).
13. **NOT exhaustive calibration** — that's Layer 3 ongoing. Just sanity-check that the classifier produces sensible distributions on real data, not all one regime.

### §2.5 Day 5 — Strategy gate audit

14. **Audit each of the 18 strategies (9 file-based + 9 in-class detect functions)** for xstock_spot applicability. Per plan doc §6.3 + Langston rev 1 categorization completion:
    - **Likely OK as-is (regime-based, generic):** `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce` (6 in-class quant); `support-bounce`, `morning-star`, `inside-bar-reversal` (3 file-based).
    - **Likely PROBLEMATIC (crypto-microstructure pattern recognizers):** `dhma`, `abcd_long` (2 in-class quant); `pivot-shift` (1 file-based). Each: tune thresholds via `module_constants` for xstock_spot scope OR scope-disable via `MULTI_FAMILY_ELIGIBILITY` map.
    - **Already-operationally-disabled (Langston rev 1 flag):** `liquidity_trap` is shorts-only-disabled per CLAUDE.md §3 — its PROBLEMATIC tag is moot for B79 ship; audit can skip.
    - **5 file-based strategies categorized in B79 Step-2 audit (Langston rev 1 callout):** `adaptive_flow`, `defensive_hedge`, `reverse_impulse`, `strong_bull_trend`, `volatility_edge`. Initial classification per detect-logic inspection during Step-2 pre-audit; categorize OK / PROBLEMATIC / SKIP at that point.
15. **Default conservative ship:** if audit finds >1 strategy unsafe, ship with whitelist of 6 well-understood strategies (per plan §10 risk #2). Revisit pattern-heavy ones in B82.

### §2.6 Day 5 — VTS shadow-mode wire-in + active-path scaffolding

16. **Weekend-pause logic in VTS evaluation gate.** SQE evaluation early-return `if (assetClass === 'xstock_spot' && isWeekendUTC()) { incrementCounter('pairsSkippedWeekendClosure'); return; }`. ~10 LOC. Add `isWeekendUTC()` utility (UTC day 0=Sun or 6=Sat, accounting for market-close at Friday 22:00 UTC and reopen at Sunday 22:00 UTC for ARCA equity hours).
17. **Signal-orchestrator emit hook for xstock_spot.** Verify existing `resolveAssetClass` call at L988 properly tags signals; admission path at `paper-execution-engine.ts:1149-1161` already uses `assetClass`. **No new code; verify-only.**
18. **RTB pool insertion for xstock_spot.** Verify `ready_to_buy_service.ts` doesn't gate on `asset_class='crypto_spot'`. If it does, remove the gate (let xstock_spot pass through). Pool ranking happens in B81 with `expectedNetReturnR` primitive.
19. **VTS evaluation accepts xstock_spot signals** (prereq §2.2 unlock). Shadow-mode means VTS computes signals + writes to `signal_eval_archive` and `regime_factor_alternates` BUT no live trade admission for xstock_spot until Phase 19 active-trading enablement.

### §2.7 Verification objectives

20. **Verify `asset_class='xstock_spot'` rows accumulating in both archive tables** within 1 scan cycle post-deploy (~30s after PM2 restart).
21. **Verify NO impact on `asset_class='crypto_spot'` row cadence** (no-touch fence — pre-flight + post-deploy SQL).
22. **Verify weekend-pause works** by manually setting test clock to Saturday and confirming SQE early-return + counter increment.
23. **CI Build+Docker green; Test+TS Check baseline-match acceptable.**

### §2.8 Governance

24. **Tier 1 + Tier 2 governance per CLAUDE.md §3.** Plan doc §9 threshold table populated for xstock_spot column. Langston MEMORY sync.

---

## §3. Out of scope

- **Live-trading testing of xstock_spot** — Phase 19.
- **Crypto_perp work** — B80.
- **RTB ranking parity (`expectedNetReturnR`)** — B81.
- **Filter-as-first-class promotion** — B81 Day 0.
- **Layer 3 deep calibration of xstock_spot thresholds** — runs IN BACKGROUND during B80/B81 (48-72h shadow window per plan §6.2).
- **Friction overrides for individual XStocks pairs** — defaults only in B79; per-pair tuning is a Phase 19 concern.
- **Solana-settlement custody / withdrawal logic** — Phase 19 active-trading scope.

---

## §4. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Pair-universe filter unlock has cascading effects** — adding xstock_spot to VTS may double the evaluation cost if 100+ XStocks pairs join the 362 currently-evaluated crypto pairs | medium | Top of §2.2 unlock = scope-test; if eval count balloons, gate xstock_spot scan to a subset (e.g. tier-1 only) for B79. |
| 2 | **Threshold derivation Layer 1 produces wrong distributions** — domain-knowledge halving might over-classify TFS or under-classify RBS | medium | Layer 2 spot-check (§2.4) catches; iterate 1-2 rounds before ship. Layer 3 (background) is the deep calibration. |
| 3 | **Strategy detect-logic false positives on equity bars** — `liquidity_trap` etc. designed for crypto microstructure | medium | Conservative whitelist ship per §2.5. Unsafe strategies disabled per asset class via module_constants OR MULTI_FAMILY_ELIGIBILITY. |
| 4 | **`market-regime.ts` modification breaks crypto_spot calibration window** (no-touch fence violation) | HIGH risk if violated | Crypto_spot branch logic + thresholds UNCHANGED; only an `if (assetClass==='xstock_spot') use XSTOCK_* else use existing` dispatch added. Diff inspection at Step-4 enforces. |
| 5 | **Friction model refactor breaks existing crypto_spot cost computation** | medium | `cost-model.ts` defaults to crypto_spot if assetClass param absent (back-compat). All existing call sites stay functional. New per-asset-class lookup only activates when xstock_spot signals reach the cost path. |
| 6 | **Weekend-pause logic gates crypto_spot too** if check ordering wrong | medium | Gate explicitly checks `assetClass === 'xstock_spot'` first — crypto_spot never enters the weekend-pause branch. Unit test required. |
| 7 | **B70 archive doesn't actually have xstock_spot OHLC** — Layer 2 spot-check would fail | low | Pre-audit SQL: `SELECT COUNT(*) FROM ohlc_archive WHERE asset_class='xstock_spot' AND captured_at > NOW() - INTERVAL '24 hours'` — verify before Day 4. If empty, scope-defer Layer 2 to "after B79 ships and we have shadow-mode data." |
| 8 | **xStocks fee schedule differs from Kraken Spot crypto** — defaults wrong | medium | Layer 1 §2.3 friction populated with assumed-same-as-crypto values; verify against Kraken docs in pre-audit. If different, update before Day 5. |

---

## §5. Files affected (preview)

**Created:**
- `server/asset_classes/types.ts` — `AssetClassFrictionModel` interface + shared types.
- `server/asset_classes/xstock_spot/friction.ts` — populated.
- `Claude Comms and Packages/Scope Files/BATCH_79_SCOPE.md` (this).
- `Claude Comms and Packages/Scope Files/BATCH_79_PRE_AUDIT.md`.
- `Claude Comms and Packages/Batch Completion/BATCH_79_COMPLETION_REPORT.md`.

**Modified (substantive logic):**
- `server/asset_classes/crypto_spot/friction.ts` — populated (was placeholder).
- `server/asset_classes/xstock_spot/regime-thresholds.ts` — populated (was placeholder).
- `server/core/math/cost-model.ts` — assetClass param threading, per-asset-class lookup.
- `server/core/metrics/market-regime.ts` — asset_class dispatch in `calculatePairRegime` (crypto_spot path unchanged).
- Whichever file gates pair universe (TBD via §2.2 investigation) — unblock for xstock_spot.
- VTS evaluation gate (likely `signal_quality_evaluator.ts` or `vts-runner.ts`) — weekend-pause logic.
- Strategy detect functions — per-asset-class scope-disable for unsafe strategies (TBD per §2.5 audit).

**Modified (verification-only):**
- `server/services/signal-orchestrator.ts` — verify L988 resolveAssetClass tagging.
- `server/services/paper-execution-engine.ts` — verify L1149-1161 admission path.
- `server/core/rtb/ready_to_buy_service.ts` — verify no crypto_spot gate.

**DB seeds (no schema change):**
- ~4 new `module_constants` rows for xstock_spot SQE thresholds.
- ~14 new `module_constants` rows for xstock_spot regime thresholds (if we choose DB-backed instead of TS-constants — Langston decision in §10 Q1).

**Estimated diff stat:** ~150-300 source lines + 18 DB rows. Larger than B78.x; smaller than B76.

---

## §6. Pre-flight no-touch fence (Step 0)

Captured 2026-05-07 ~14:30 UTC (post-B78.2 close, pre-B79):
```
factor_name                 | n_last_hour
b67_1_btc_dominance         | 20
b67_1_funding_rates         | 20
b67_1_mcap_momentum         | 20
b67_2_phase_preference      | 19
b67_4_outcome_feedback      | 20
b68_1_multi_tf_agreement    | 20
b68_2_volume_regime         | 20
b68_3_pair_correlation      | 20
b68_4_regime_age            | 20
b68_5_path_b_sustainability | 19
```
Healthy steady-state cadence on crypto_spot. Repeat post-B79 deploy in Step 7 — must stay in 18-30 range.

---

## §7. Verification (Step 7 + 8)

1. CI Build+Docker green; Test+TS Check baseline-match.
2. Madge cycle count: post-B79 should be ≤46 (no new cycles introduced; ≤B78.1 baseline).
3. Post-deploy:
   - HTTP 200, PM2 errors only pre-existing.
   - **`asset_class='xstock_spot'` rows arriving** in `signal_eval_archive` and `regime_factor_alternates` within 1 scan cycle.
   - **`asset_class='crypto_spot'` cadence unchanged** (no-touch fence post-deploy SQL).
   - Weekend-pause unit test green.
   - Spot-check 5 XStocks pairs in regime classification produce non-uniform distribution.
4. Visual UI smoke (Claude-in-Chrome): VTS dashboard shows xstock_spot pair count > 0; signal funnel includes xstock entries.
5. Langston Step-8 second-pass verify.

---

## §8. Langston work delegation

| Task | When | Verification by CC |
|---|---|---|
| Step-1+2 scope review (full — substantive batch) | combined | standard. |
| Threshold derivation Layer 1 review | Step-1+2 | I draft per plan §6.2; he sanity-checks domain-knowledge values against his market intuition. |
| §2.2 pair-universe filter location guess | Step-2 pre-audit | CC investigates; Langston cross-checks with his memory of scanner architecture. |
| Strategy detect-logic audit (§2.5) | Step-4 | I read each strategy's detect; he reviews the safe/unsafe categorization. |
| Step-4 diff review + Step-8 second-pass | standard | standard. |

---

## §9. Governance update list

Tier 1: BATCH_CATALOG, PHASE_HISTORY, MEMORY 3-way sync, scope + completion report.
Tier 2: SYSTEM_MANUAL (Modularization Phase appendix updated to reflect xstock_spot now-populated; remove "placeholder" labels). SYSTEM_IMPACT_MAP (new module surfaces). CHANGES_AND_FIXES. RUNNING_ISSUES (#73 shim cleanup still pending B81; #74 forward-watch). MULTI_ASSET_VTS_EXPANSION_PLAN.md §9 threshold table populated for xstock_spot column; §12 update-log row.

---

## §10. Open questions for Langston Step 1 review

1. **xstock_spot regime thresholds: TS constants in `regime-thresholds.ts` (per B78 pattern) OR `module_constants` DB rows (more tunable)?** TS constants are simpler and matches B78 crypto_spot pattern. DB rows give Phase 19 operator the ability to tune without redeploy. Lean: TS constants for B79; promote to DB only when an operator-tunable need arises (probably never for regime branch conditions — those are calibration outputs, not operational levers).
2. **Strategy gate audit (§2.5) — categorization confidence threshold.** The list of "likely OK" vs "likely PROBLEMATIC" strategies is my best guess. Should the conservative whitelist ship be the default (only 6 strategies enabled for xstock_spot in B79) or should we ship all 18 and rely on shadow-mode data to catch false-positives?
3. **§2.2 pair-universe filter — investigation strategy.** Should I trace from `krakenUniverseSize: 1530` log line down by greping all pair-source filtering, OR just add an explicit `if (xstock_spot) skip` bypass for the immediate need and trace properly in B82? Lean: trace properly now (~1-2hr) to avoid technical debt.
4. **Friction model: per-pair overrides hash in `friction.ts` OR DB `module_constants` rows scoped by `pair_symbol`?** TS hash is simpler for B79 defaults; DB rows scale better for Phase 19 per-pair tuning. Lean: TS hash with empty `perPairOverrides` for B79; DB rows in B81 alongside filter-as-first-class promotion.
5. **Weekend-pause logic: UTC-only check (Sat/Sun) OR ARCA-equity-hours-aware (Friday 22:00 UTC close → Sunday 22:00 UTC reopen)?** UTC-only is simpler (~3 LOC); ARCA-aware is correct (the actual XStocks trading calendar may have specific gaps around US equity holidays). Lean: ARCA-aware default with a `xstockMarketHoursOverride` module_constant for future flexibility (e.g. if XStocks tracks crypto-style 24/7 trading on a subset of pairs).

---

*End of BATCH_79_SCOPE.md rev 1. Pending Langston Step 1+2 combined review.*
