# B79.0n.CONFIDENCE-CHAIN — Pre-audit (v1.1 with addendum)

**Status:** v1.1 — Langston Step 2 ACK with 4 non-blocking clarifications + 2 new risks. v1.1 addendum incorporates all 4 below in §10.
**Author:** Claude Code, 2026-05-25.
**Predecessor:** `B79_0n_CONFIDENCE_CHAIN_SCOPE.md` (commit `8293ed5d2`, Langston Step 1 ACK 2026-05-25 with D-1..D-5 ✅ AGREE + 7 nuances A-G to address).
**Step 2 ACK:** 2026-05-25 (Langston reply) — conditional on §10 addendum addressing clarifications 1-4 + R-10 / R-11 added.

---

## §0 — PREVIOUSLY-STATED-VS-NOW deltas

| Item | Previously stated (scope v1) | Now | Reason |
|---|---|---|---|
| xstock SPY canonical ticker | `SPY/USD` (assumed; Langston nuance A flagged likely `SPYx/USD` Backed-Finance convention) | **CONFIRMED `SPY/USD`** — single-row probe of `xstock_spot_universe` 2026-05-25 returns `SPY/USD | SPY | INDEX_PROXY` with 20,072 bars in `xstock_spot_ohlc_1m_2026_05`. No `SPYx/USD` row anywhere. Backed-Finance synthetic-naming convention does NOT apply to Kraken's xstock universe as configured. | Live DB query. |
| outcome-feedback `.backup` retention path | `/tmp/b67-4-outcome-feedback.json.backup` (scope §6 R-1) | **`/home/deploy/dawntrader/data/b67-4-outcome-feedback.json.backup`** — `/var/lib/dawntrader/` does not exist; `/home/deploy/dawntrader-state/` does not exist; `/home/deploy/dawntrader/data/` already houses persistent paper-trade JSON files dating back to 2026-03-30 deploy. Same persistent-state path used by paper-portfolio-manager. | Filesystem probe of staging 2026-05-25. |
| outcome-feedback live store path | `/tmp/b67-4-outcome-feedback.json` (scope §3 Obj 13 — unchanged) | **MOVE LIVE STORE TOO — `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json`** (same path family as backup) | Langston nuance C extends naturally: if the backup needs to be off `/tmp/`, the live store does too. Pre-audit upgrades both. |
| regime-phase-store path | Not in scope v1 | **NEW pre-audit finding** — `regimePhaseStore` ALSO persists at `/tmp/regime-phase-store.json` and has the same `/tmp/`-purge-on-restart vulnerability. Move to `/home/deploy/dawntrader/data/regime-phase-store.json` in the same chunk. | Pre-audit cross-reference (Step 1.a read of `regime-phase.ts:106`). |
| Modulator sub-batch count | 9 modulators in scope (b67_1..4 + b68_1..5) | UNCHANGED. But pre-audit now confirms the chain-composition has **8 alternateInputs.push() sites per file × 2 files = 16 sites** matches the 8 modulators that emit alternates (b67_3 TFS-desat is in-classifier, not a chain push). | Step 1.a read of signal-orchestrator + vts-runner Pass-1 stash sites. |

---

## §1 — Langston nuance-by-nuance resolution

### Nuance A — Canonical xstock SPY ticker

**Resolution:** `SPY/USD` is correct. DB probe 2026-05-25:

```sql
SELECT symbol, name, sector FROM xstock_spot_universe
WHERE symbol ILIKE '%SPY%' OR name ILIKE '%S&P%' OR sector IN ('BROAD_ETF', 'INDEX_PROXY');
```

Returns 9 rows. The relevant ones for correlation reference:
- `SPY/USD | SPY | INDEX_PROXY` — broad-market reference (S&P 500)
- `QQQ/USD | QQQ | INDEX_PROXY` — Nasdaq-100 alternative reference
- `SPGI/USD | S&P Global Inc | XLF` — financial-sector single-name (not a reference)

OHLC availability confirmed: `xstock_spot_ohlc_1m_2026_05` has 20,072 bars for `SPY/USD` ending 2026-05-22 23:59:00 UTC. SPY is tradeable + has deep history.

**Implication for D-2:** seed migration uses `btc_reference_symbol = 'SPY/USD'` for `module_constants.pair_correlation.xstock_spot.*`. The `compute_correlation_enabled = false` default for v1 (Langston D-2 disposition) still applies — the flag flip awaits a follow-up batch that calibrates SPY-relative correlation thresholds, NOT a follow-up that wires up OHLC (OHLC is already available).

### Nuance B — D-3 strategy-key mismatch in `b67_2` phase-preference

**Resolution:** PER-CLASS STRATEGY KEY SET + fail-hard on missing. Implementation pattern:

1. The `module_constants.regime_phase.<assetClass>.strategy_phase_weights` JSONB blob is seeded WITH the asset class's actual strategy set, not cloned crypto strategies.
2. For `crypto_spot`: 18 strategies × 3 phases = 54 cells (existing).
3. For `xstock_spot`: per B79.0n.STRATEGY closure 2026-05-23, the xstock strategy set is the 9 non-ORB strategies enabled in `strategy_gates.xstock_spot.*`. So 9 × 3 = 27 cells. Initial values: neutral 1.0 across the board (no prior calibration data; tuning is a post-deploy follow-up).
4. `applyPhasePreference(strategy, phase, weights, baseConfidence, assetClass)` calls into the per-class weights blob. Missing-key (e.g., a strategy enabled for xstock_spot but not seeded in the xstock_spot blob) THROWS HARD with `[B67.2][missing-weight] no entry for <key> in strategy_phase_weights blob for asset_class=<class>. Migration must seed all <N> cells. Add to module_constants and redeploy.`
5. The seed migration must enumerate `strategy_gates.<class>.*` rows where `enabled=true` to derive the strategy set per class, ensuring completeness by construction.

**Risk eliminated:** xstock-enabled strategies cannot silently default to weight=1.0 due to a missing key; the fail-hard error forces seed-completeness discipline at every future strategy addition.

### Nuance C — `/tmp/` purge risk for `.backup`

**Resolution:** Move BOTH the live store AND the backup to `/home/deploy/dawntrader/data/`. Concretely:

| File | Old path | New path |
|---|---|---|
| outcome-feedback live | `/tmp/b67-4-outcome-feedback.json` | `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json` |
| outcome-feedback backup | (scope v1: `/tmp/b67-4-outcome-feedback.json.backup`) | `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json.backup` |
| regime-phase-store live | `/tmp/regime-phase-store.json` | `/home/deploy/dawntrader/data/regime-phase-store.json` |

The `data/` directory already exists with `chmod 755 deploy:deploy` and houses paper-trade JSON files dating back to deploy day. Same path family as paper-portfolio-manager state. PM2 restart does NOT wipe `~/dawntrader/data/`; only `/tmp/` is at risk.

**One-time-migration sequence on first boot post-deploy:**
1. If `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json` exists → load it (new path, new shape).
2. Else if `/tmp/b67-4-outcome-feedback.json` exists → load legacy from old path, re-key under `crypto_spot` prefix (Langston D-4), write to NEW path, leave old path in place for 7d as `.legacy` (no rename needed; the constructor will preferentially use the new path on future boots).
3. Else cold-start.
4. Same logic for `regime-phase-store.json`.

**Implication for §3 Obj 13:** the "atomic rename" in scope v1 changes to "atomic write to new path + leave old path as `.legacy` for 7d".

### Nuance D — Atomicity boot sequence

**Verified:** `outcomeFeedbackStore` and `regimePhaseStore` are module-level singletons (`export const outcomeFeedbackStore = new OutcomeFeedbackStore();`) — constructed at IMPORT TIME. The `loadFromDisk()` call inside the constructor is SYNCHRONOUS (`fs.readFileSync`). So by the time any module imports `outcomeFeedbackStore`, the migration is already complete.

**Boot sequence (verified by reading `outcome-feedback-store.ts:229` + `regime-phase.ts:334`):**

1. Node.js loads the module → constructor fires → `loadFromDisk()` synchronously reads + migrates.
2. ANY downstream import (paper-execution-engine, vts-runner, signal-orchestrator) gets the already-warm singleton.
3. Close-hook callers (`paper-execution-engine.ts` + `vts-runner.ts`) invoke `outcomeFeedbackStore.updateEma(...)` only DURING trade-close events — which can only fire AFTER MCE has started + the scanner cycle has emitted the trade → minutes after process boot.

**Risk eliminated:** there is no race window for in-flight close-hook writes to corrupt the migration. The migration is synchronous + completes during import resolution, BEFORE any close-hook is wired up.

**Caveat:** if the migration fails partway (e.g., JSON parse error on legacy file), the constructor logs a warning + continues with empty state. The legacy file is NOT renamed/deleted in this case — operator can re-attempt manually. Pre-audit confirms this matches the existing `loadFromDisk()` error-handling pattern.

### Nuance E — SIM §B69 wording

**Resolution:** Step 10 governance MUST edit SIM Chapter B69 (Modulator Chain semantics) to reflect per-class disposition. Concrete wording draft for Step 10:

> **B67.1 macro modifier (per-class disposition):** For `crypto_spot` — BTC dominance, derivatives funding rates, total crypto market cap momentum (z-scored vs rolling 48-sample baseline). For `xstock_spot` — explicit no-op (factor=1.0 + `asset_class_no_op_active: true` metadata). Equity-macro inputs (VIX, DXY, SPY momentum) deferred to a Phase 24 macro-feed batch.
>
> **B68.3 pair correlation (per-class disposition):** For `crypto_spot` — Spearman rank correlation vs `XBT/USD` (BTC) reference. For `xstock_spot` — Spearman rank correlation vs `SPY/USD` (S&P 500 INDEX_PROXY); `compute_correlation_enabled = false` in v1 pending calibration; factor=1.0 + `metadata.compute_disabled: true` until follow-up.

Same per-class disposition note pattern in B67.2 (per-class JSONB blob), B67.4 (per-class store key), and B68.4 (per-class target age). Step 10 will refactor §B69 to one "per-class table" section + factor-by-factor disposition rows.

### Nuance F — UI dashboard panel hardcoded crypto accessor paths

**Resolution:** During Step 7 CC first-pass + Step 8 Langston second-pass UI verification (via Claude-in-Chrome per CLAUDE.md §9.3 + §10.5), grep the dashboard `client/` for any `/api/regime/.../crypto_spot` hardcoded path or any modulator-specific component reading from a non-class-parameterized endpoint. If found:
- If the path is read-only diagnostic / informational → mark as RUNNING_ISSUES register entry (Phase 16 cleanup); does NOT block the batch.
- If the path is load-bearing for the xstock confidence panel → escalate to in-batch fix or punt to a small follow-up sub-batch depending on size.

Pre-audit grep:

```
client/src/**/regime/*.tsx — find any hardcoded crypto_spot or XBT references
client/src/**/dashboard/*.tsx — same
```

(Will execute during Step 3 chunk planning OR Step 7 verification — whichever fits the dispatch cadence better.)

### Nuance G — Chunk B + D sequencing

**Resolution:** Chunk plan revised per scope v1 §12. New sequencing for Step 3:

| Chunk | Prior position | New position | Why |
|---|---|---|---|
| A — migration SQL (seed) | First | First (UNCHANGED) | DB seeds before code reads them |
| **B+D combined — pure-function signatures + FactorAlternateInput arms (single working-tree state)** | B was Chunk 2, D was Chunk 4 | **Chunk 2** (merged) | Per Langston nuance G — tsc enumeration only works on a complete-state working tree; B alone doesn't surface all sites |
| C — MCE refresh + accessor refactor | Chunk 3 | Chunk 3 (UNCHANGED) | After signatures stable |
| E — chain-composition consumer threading | Chunk 5 | **Chunk 4** | After B+D land, tsc enumerates surface; thread `assetClass` at every site |
| F — outcome-feedback store key migration + disk-load path | Chunk 6 | Chunk 5 | Data-layer changes can land after the API signatures |
| G — unit tests | Chunk 7 | Chunk 6 | Test surface after all production changes |
| H — local tsc + vitest + baseline:check | Chunk 8 | Chunk 7 | Final verification gate before push |

Total Step 3 sub-chunks: 7 (was 8). The B+D merge eliminates one push.

---

## §2 — Per-component upstream / downstream / blast-radius enumeration

### §2.1 — `b67_1 macro-modifier` (`server/core/metrics/macro-modifier.ts`)

**Surface API:** `computeMacroModifier(snapshot, baseline, config)` + `buildB67_1Alternates(modulatedConfidence, modifier, regimeLabel, admissionPossible, config)`.

**Upstream feeders:**
- `MarketContextEngine.refreshMacroConfig()` (lines 410-...) — reads `module_constants.macro_modifier.<exchange>.*.*.*` per the wildcard RES_KEY (today; per-class read in CONFIDENCE-CHAIN).
- `MarketContextEngine.refreshMacroContext()` — reads `getLatestMacroSnapshot()` from `external-macro-feed.ts` (the BTC dominance / funding / mcap feed).
- Both feed-resolved values cached at MCE for the cycle.

**Downstream consumers:**
- `signal-orchestrator.ts:638` (chain entry) — calls `getCurrentMacroConfig()` + `getCurrentMacroContext()`, computes modifier, multiplies into `modulatedConfChain`, pushes `{ kind: 'b67_1', modifier, admissionPossible, config }` onto `alternateInputs`.
- `vts-runner.ts:1594` — mirror site.
- `paper-execution-engine.ts:2020-2026` — reads `_b67_2_1_macro = mce.getCurrentMacroContext()` for B68.5 ablation rebuild on trade close.

**Blast radius:** moderate. Pure function with no state. Per-class refactor changes signature only; xstock no-op disposition means the modifier value is identity (1.0) for xstock signals. Crypto path unchanged.

**Per-class disposition (D-1):** xstock_spot rows seeded with `modifier_min = modifier_max = 1.0` + new `asset_class_no_op_active = true` row in the `macro_modifier` module. The function reads the no-op flag and short-circuits cleanly:

```ts
if (config.assetClassNoOpActive) {
  return { value: 1.0, btcDomZ: NaN, fundingZ: NaN, mcapZ: NaN,
    fallbackActive: false, staleDataFlag: false };
}
// ... existing crypto-path math ...
```

The flag is a per-class config field; the function signature gains `assetClass: AssetClass` so callers can pass the resolved per-class config explicitly.

### §2.2 — `b67_2 phase-preference` (`server/core/metrics/regime-phase.ts`)

**Surface API:** `applyPhasePreference(strategy, phase, weights, baseConfidence)` + `buildB67_2Alternate(...)` + `regimePhaseStore.tick(symbol, currentRegime, now, backfillCtx?)` + `regimePhaseStore.peekAgeMs(symbol, now)`.

**Upstream feeders:**
- `MarketContextEngine.refreshPhaseConfig()` — reads `module_constants.regime_phase.*` for `b67_2_early_phase_max_hours`, `b67_2_prime_phase_max_hours`, `strategy_phase_weights` JSONB blob.
- `regimePhaseStore.tick` driven from MCE compute-context lifecycle.

**Downstream consumers:**
- `signal-orchestrator.ts:759` (`kind: 'b67_2'` push).
- `vts-runner.ts:1618` (mirror).
- `paper-execution-engine.ts:2020-2026` reads `_b67_2_1_phase` from cached context.

**Blast radius:** moderate. The per-class weights blob is per-class JSONB row (Langston nuance B disposition). `applyPhasePreference` signature gains `assetClass: AssetClass`; callers pass the per-class weights blob. Missing-key throws clearly.

**Per-class disposition (D-3):** seed `module_constants.regime_phase.xstock_spot.strategy_phase_weights` with 27 cells (9 xstock-enabled strategies × 3 phases) at neutral 1.0. Migration enumerates `strategy_gates.xstock_spot.*` for the strategy list.

### §2.3 — `b67_3 TFS-desat` (`server/core/metrics/market-regime.ts:320-325`)

**Surface API:** Inside `calculatePairRegime` — multiplicative confidence formula at line 320:

```ts
confidence = regimeConfig.tfsDesatMin
  + (regimeConfig.tfsDesatMax - regimeConfig.tfsDesatMin)
    * (momentumFactor * dbsStrength * volInverse);
```

**Upstream feeders:**
- `MarketContextEngine.refreshRegimeConfig()` — reads `module_constants.regime_classifier.<assetClass>.*` for `tfsDesatMin/Max/MomentumScale/VolatilityScale/DbsScale`.
- B79.0n.MCE seeded 2 xstock_spot rows in `regime_classifier`; pre-audit confirms which 2 (likely `tfsDesatMin` + `tfsDesatMax` or similar — needs explicit DB query during Step 2).

**Downstream consumers:**
- `calculatePairRegime` is called from `regime-phase.ts:268` (backfill), `multi-tf-agreement.ts:142` (higher-TF), `regime-age-factor.ts:147` (Path-B counterfactual), AND `market-context-engine.ts:???` (main classify path).
- `calculatePairRegime` already takes `assetClass: AssetClass` per B79.0n.MCE.

**Blast radius:** low. F-1 by construction. The math is identical per class; the input constants are per-class via B79.0n.MCE seeding. CONFIDENCE-CHAIN only needs to verify the remaining 3 TFS-desat constants (`tfsMomentumScale`, `tfsVolatilityScale`, `tfsDbsScale`) have xstock_spot seed rows. If only 2 are seeded today, add the missing 3.

**Action item:** DB query during Step 2 deep-dive to enumerate which `regime_classifier` constants ARE seeded for xstock_spot vs which are still missing.

### §2.4 — `b67_4 outcome-feedback` (`server/core/metrics/outcome-feedback-store.ts`)

**Surface API:** `outcomeFeedbackStore.updateEma(regime, strategy, netPnlPct, alpha, now)` + `outcomeFeedbackStore.peek(regime, strategy)` + `computeOutcomeFeedbackFactor(entry, config)` + `buildB67_4Alternate(...)`.

**Upstream feeders:**
- `MarketContextEngine.refreshOutcomeFeedbackConfig()` — reads `module_constants.outcome_feedback.*` for alpha / sensitivity / minSamples / factor min/max / expiryHours.
- Trade-close events from `paper-execution-engine.ts` (active trades) + `vts-runner.ts` (VTS trades) call `outcomeFeedbackStore.updateEma(...)` at the close hook.

**Downstream consumers:**
- `signal-orchestrator.ts:798` (`kind: 'b67_4'` push) — calls `outcomeFeedbackStore.peek(regime, strategy)` + `computeOutcomeFeedbackFactor(entry, config)`.
- `vts-runner.ts:1655` (mirror).

**Blast radius:** HIGH. Store key shape change ripples to ~6 call sites across 4 files. Disk-load migration + path move = data layer change. F-2 (per-class isolation required).

**Per-class disposition (D-4):** store map key becomes `<assetClass>_<regime>_<strategy>`. `updateEma(assetClass, regime, strategy, netPnlPct, alpha, now)` + `peek(assetClass, regime, strategy)`. Disk-load migration re-keys legacy `<regime>_<strategy>` entries under `crypto_spot_` prefix.

### §2.5 — `b68_1 multi-tf-agreement` (`server/core/metrics/multi-tf-agreement.ts`)

**Surface API:** `computeMultiTfAgreement(activeTfRegime, higherTfOhlc, config, regimeConfig, assetClass: AssetClass)` ✅ ALREADY REQUIRED-assetClass (B79.0n.MCE) + `buildB68_1Alternate(realConfidence, realRegimeLabel, result, config)`.

**Upstream feeders:**
- `MarketContextEngine.refreshMultiTfAgreementConfig()` — reads `module_constants.multi_tf_agreement.*`.
- Higher-TF OHLC fetched via `ohlcCache.getOHLCData(symbol, 240)`.

**Downstream consumers:**
- `signal-orchestrator.ts:918` + `vts-runner.ts:1761`.

**Blast radius:** low. `compute` is already class-aware. CONFIDENCE-CHAIN refactors only the `buildB68_1Alternate` signature (gains `assetClass`) + MCE refresh per-class + metadata `asset_class` stamp.

**Per-class disposition:** F-1 by construction. Per-class config tuning may differ (sensitivity, thresholds) but math is invariant.

### §2.6 — `b68_2 volume-regime` (`server/core/metrics/volume-regime.ts`)

**Surface API:** `computeVolumeRegime(ohlcData, config)` + `buildB68_2Alternate(...)`.

**Upstream feeders:**
- `MarketContextEngine.refreshVolumeRegimeConfig()` — reads `module_constants.volume_regime.*`.

**Downstream consumers:**
- `signal-orchestrator.ts:821` + `vts-runner.ts:1672`.

**Blast radius:** low. F-1 by construction. Per-class config tuning (accumulation/distribution thresholds, liquidation-spike multiplier) may differ for xstock vs crypto liquidity profiles, but the math is invariant.

### §2.7 — `b68_3 pair-correlation` (`server/core/metrics/pair-correlation.ts`)

**Surface API:** `computePairCorrelation(pairSymbol, pairOhlc, btcOhlc, config)` + `buildB68_3Alternate(...)`.

**Upstream feeders:**
- `MarketContextEngine.refreshPairCorrelationConfig()` — reads `module_constants.pair_correlation.*` including `btc_reference_symbol` (per-class in CONFIDENCE-CHAIN; default `XBT/USD` crypto, `SPY/USD` xstock per nuance A resolution).
- Pair OHLC + reference OHLC both fetched at call site.

**Downstream consumers:**
- `signal-orchestrator.ts:867` + `vts-runner.ts:1713`.

**Blast radius:** moderate. F-2 (reference symbol per-class). Signature gains `assetClass`. `compute_correlation_enabled` config field — when false, factor short-circuits to 1.0 + metadata flag.

**Per-class disposition (D-2 confirmed):** xstock_spot rows seeded `btc_reference_symbol = 'SPY/USD'` + `compute_correlation_enabled = false` (v1 default). Crypto rows unchanged: `btc_reference_symbol = 'XBT/USD'` + `compute_correlation_enabled = true`.

### §2.8 — `b68_4 regime-age freshness` (`server/core/metrics/regime-age-factor.ts:54-70`)

**Surface API:** `computeFreshnessFactor(ageMs, config)` + `buildB68_4Alternate(...)`.

**Upstream feeders:**
- `MarketContextEngine.refreshRegimeAgeConfig()` — reads `module_constants.regime_age.*` for target_age_hours / sensitivity / factor_min/max.
- Age data from `regimePhaseStore.peekAgeMs(symbol, now)`.

**Downstream consumers:**
- `signal-orchestrator.ts:781` + `vts-runner.ts:1638`.

**Blast radius:** low. F-1 by construction. Per-class config tuning (target_age_hours likely differs — crypto 24/7 vs xstock RTH 6.5h trading window) — record as per-class config.

**Per-class disposition:** xstock_spot row seeded `target_age_hours = 2.0` (rough RTH-adjusted; calibration follow-up). Crypto unchanged at 6.0.

### §2.9 — `b68_5 path-B sustainability` (`server/core/metrics/regime-age-factor.ts:124-197`)

**Surface API:** `buildB68_5Alternate(ohlcData, dbsScore, dbsSlope, macroModifier, regimeConfig, realRegimeLabel, realConfidence, assetClass: AssetClass)` ✅ ALREADY REQUIRED-assetClass (B79.0n.MCE).

**Upstream feeders:**
- Caller-resolved RegimeConfig (per-class via B79.0n.MCE).
- `module_constants.regime_age` cross-module read for `momentum_floor_path_a` (B72).

**Downstream consumers:**
- `signal-orchestrator.ts:944` + `vts-runner.ts:1785` (both already pass `assetClass: ...`).

**Blast radius:** low. F-1 by construction; B79.0n.MCE handled the per-class routing.

---

## §3 — Caller-surface enumeration (compile-driven probe — current snapshot)

Pre-audit running `npx tsc --noEmit` on the local mirror against scope v1 hypothetical signature changes. Surfaced caller sites (snapshot before chunk B+D land):

| Function gaining REQUIRED `assetClass` | Caller sites |
|---|---|
| `computeMacroModifier` | 1 — MCE (`refreshMacroContext` invokes the modifier on every macro cycle) |
| `computeOutcomeFeedbackFactor` | 2 — signal-orchestrator + vts-runner |
| `computeVolumeRegime` | 2 — signal-orchestrator + vts-runner |
| `computePairCorrelation` | 2 — signal-orchestrator + vts-runner |
| `computeFreshnessFactor` | 2 — signal-orchestrator + vts-runner |
| `applyPhasePreference` | 2 — signal-orchestrator + vts-runner |
| `outcomeFeedbackStore.updateEma` | 2 — paper-execution-engine + vts-runner trade-close hooks |
| `outcomeFeedbackStore.peek` | 2 — signal-orchestrator + vts-runner (the `entry` lookup before `computeOutcomeFeedbackFactor`) |
| `buildB67_1Alternates` | 1 — factor-ablation-builders dispatch |
| `buildB67_2Alternate` | 1 — factor-ablation-builders dispatch |
| `buildB67_4Alternate` | 1 — factor-ablation-builders dispatch |
| `buildB68_1Alternate` | 1 — factor-ablation-builders dispatch |
| `buildB68_2Alternate` | 1 — factor-ablation-builders dispatch |
| `buildB68_3Alternate` | 1 — factor-ablation-builders dispatch |
| `buildB68_4Alternate` | 1 — factor-ablation-builders dispatch |
| `MCE.getCurrentMacroConfig` | 2 — signal-orchestrator + vts-runner (line 638 + line 1594) |
| `MCE.getCurrentPhaseWeights` | 2 — signal-orchestrator + vts-runner |
| `MCE.getCurrentOutcomeFeedbackConfig` | 2 — signal-orchestrator + vts-runner |
| `MCE.getCurrentRegimeAgeConfig` | 2 — signal-orchestrator + vts-runner |
| `MCE.getCurrentVolumeRegimeConfig` | 2 — signal-orchestrator + vts-runner |
| `MCE.getCurrentPairCorrelationConfig` | 2 — signal-orchestrator + vts-runner |
| `MCE.getCurrentMultiTfAgreementConfig` | 2 — signal-orchestrator + vts-runner |
| `FactorAlternateInput` arms (7 new `assetClass: AssetClass` fields) | 16 push sites (8 in signal-orchestrator + 8 in vts-runner) |

**Total surface estimate:** ~50 distinct call sites across 5 files. Compile-driven enumeration via tsc will surface every one. Anti-graveyard discipline guarantees no `as any` shortcuts.

---

## §4 — Test surface

**Existing tests in scope (pre-audit grep):**

| File | Tests | Notes |
|---|---|---|
| `server/tests/unit/b67-1-macro-modifier.test.ts` | 18 tests | Will need updates: signature change for `computeMacroModifier`, new `asset_class_no_op_active` cases for xstock |
| `server/tests/unit/b67-2-phase-dimension.test.ts` | ~10 tests | Signature update for `applyPhasePreference`; new per-class blob lookup cases |
| `server/tests/unit/b67-3-5-tfs-desat.test.ts` | ~4 tests | No direct signature changes; per-class config seeding verified at test setup |
| `server/tests/unit/b67-4-outcome-feedback.test.ts` | ~12 tests | Major updates — `updateEma`/`peek` signature, per-class key shape, legacy-as-crypto migration round-trip |
| `server/tests/unit/b68-1-multi-tf-agreement.test.ts` | ~14 tests | Mostly unchanged (`compute` already class-aware); `buildB68_1Alternate` signature update |
| `server/tests/unit/b68-2-volume-regime.test.ts` | ~12 tests | Signature update for `computeVolumeRegime` + per-class metadata |
| `server/tests/unit/b68-3-pair-correlation.test.ts` | ~10 tests | Major updates — per-class reference symbol, `compute_correlation_enabled` flag |
| `server/tests/unit/b68-5-path-b-sustainability.test.ts` | ~8 tests | No changes; already class-aware |
| `server/tests/unit/b76-chain-final-emit.test.ts` | ~6 tests | Discriminated-union arm extension — all 7 affected kinds gain new field assertions |

**Total existing tests to update:** ~94 tests across 9 files. Most are minimal signature-update changes; b67_4 and b68_3 have substantive new-case coverage.

**New tests (per scope §3 Obj 20):**
- `b79-0n-confidence-chain-required-assetclass.test.ts` — ~12 type-lock tests
- `b79-0n-confidence-chain-outcome-feedback-isolation.test.ts` — ~8 isolation tests
- `b79-0n-confidence-chain-mce-per-class-resolve.test.ts` — ~12 per-class resolve tests
- `b79-0n-confidence-chain-asset-class-no-op.test.ts` — ~8 no-op + correlation-disabled tests

**Total new tests:** ~40. Combined with existing test updates: ~134 tests covering the chain.

---

## §5 — DB migration design

### Migration file: `drizzle/migrations/2026-05-25-b79-0n-confidence-chain-per-class-seed.sql`

Atomic BEGIN/COMMIT. Idempotent via `ON CONFLICT DO NOTHING` (preferred) or `ON CONFLICT ... DO UPDATE` for the few rows that need updates.

**Seed groups:**

1. **`macro_modifier` xstock_spot rows (12 new):** clone every crypto wildcard row to xstock_spot with EQUAL constant values EXCEPT `modifier_min` and `modifier_max` both set to 1.0 (clamp to identity).
2. **`macro_modifier.*.*.*.*.asset_class_no_op_active` (2 new):** crypto_spot = false, xstock_spot = true.
3. **`regime_phase.xstock_spot.strategy_phase_weights` (1 new JSONB row):** value is JSONB blob of 27 cells (9 strategies × 3 phases, all 1.0).
4. **`regime_phase.xstock_spot.b67_2_early_phase_max_hours` + `b67_2_prime_phase_max_hours` (2 new):** initial values clone crypto (2.0 + 12.0); calibration follow-up may adjust for RTH cadence.
5. **`regime_classifier.xstock_spot.*` completion (3-5 new — pending Step 2 deep-dive on what's already seeded):** ensure all TFS-desat constants present.
6. **`outcome_feedback.xstock_spot.*` (6 new):** clone crypto values (alpha, sensitivity, minSamples, factorMin/Max, expiryHours).
7. **`regime_age.xstock_spot.*` (5 new):** clone crypto; `target_age_hours` adjusted to 2.0 (vs crypto 6.0) for RTH cadence; remainder cloned.
8. **`path_b_sustainability.xstock_spot.*` completion (1-2 new — pending completeness check; B79.0n.MCE seeded 1 already).**
9. **`volume_regime.xstock_spot.*` (8 new):** clone crypto values v1; calibration follow-up.
10. **`pair_correlation.xstock_spot.*` (8 new — with substitutions):** clone crypto EXCEPT `btc_reference_symbol = 'SPY/USD'` (was `'XBT/USD'`) + add new `compute_correlation_enabled` constants both classes (crypto=true, xstock=false).
11. **`multi_tf_agreement.xstock_spot.*` (8 new):** clone crypto values v1.

**Expected total new rows:** approximately 64 + 2 new constants for new module pattern. (More precise count emerges during chunk A implementation when actual crypto row enumeration is done.)

**Schema impact:** zero. All inserts go into existing `module_constants` table. Compatibility test: `SELECT module_name, asset_class, COUNT(*) FROM module_constants GROUP BY 1, 2 HAVING COUNT(*) > 0` returns expected post-migration counts.

**Rollback:** `BEGIN; DELETE FROM module_constants WHERE asset_class = 'xstock_spot' AND module_name IN ('macro_modifier', 'regime_phase', ...); COMMIT;` — safe because no foreign keys.

---

## §6 — Verification gates (consolidated from scope §5)

1. ✅ Local `npx tsc --noEmit` from mirror — baseline 494 unchanged, no new errors per file per code.
2. ✅ Local `npx vitest run` — all tests pass (~134 covering the chain).
3. ✅ `npm run baseline:check` — zero NEW `as any`/`@ts-expect-error`/`@ts-ignore`/`!` outside dedicated type-lock test file.
4. ✅ CI all 4 jobs GREEN per CLAUDE.md §5 #19.
5. ✅ Staging deploy clean — `[MCE][refresh] per_class=crypto_spot|xstock_spot` for every modulator on first refresh.
6. ✅ psql confirms xstock_spot rows seeded for all 9 modulator modules.
7. ✅ PM2 logs show no fail-hard throws on missing-class lookup.
8. ✅ xstock signal evaluations: B67.1 alternates with `asset_class_no_op_active = true`; B68.3 alternates with `metadata.reference_symbol = 'SPY/USD'` + `metadata.compute_disabled: true`.
9. ✅ UI via Claude-in-Chrome: xstock confidence panels render finite values; no NaN / undefined renders.
10. ✅ Langston Step 8 second-pass.

---

## §7 — Risk register (consolidated + new)

| # | Risk | Mitigation | Status |
|---|---|---|---|
| R-1 | outcome-feedback migration corruption | Atomic write to new path + leave legacy at old path for 7d as `.legacy`; unit test round-trip | Per nuance C resolution |
| R-2 | per-class refresh memory leak | Bounded enumeration via `ASSET_CLASSES` const (2 entries today); log line `[MCE][refresh] enumerated=N classes` | Per scope §6 R-2 |
| R-3 | xstock macro silently active if future batch wires feed without flag flip | `asset_class_no_op_active` flag checked at function level; unit test verifies honored | Per scope §6 R-3 |
| R-4 | chain-composition site missed | tsc compile-driven probe surfaces every site | Per scope §6 R-4 |
| R-5 | cross-module `regime_age` read drift | Pre-audit confirms `momentum_floor_path_a` cross-module read pattern preserved; per-class resolution honors key shape | Per scope §6 R-5 |
| R-6 | crypto byte-identity regression | Existing crypto tests preserved; new tests ADD coverage; staging crypto signal generation rate +/- 5% over 24h soak | Per scope §6 R-6 |
| **R-7 NEW** | xstock SPY OHLC missing data window during ARCA off-hours (overnight gap) | `compute_correlation_enabled = false` v1 default means the factor is identity regardless; OHLC continuity is a follow-up batch concern | Per nuance A + D-2 |
| **R-8 NEW** | per-class JSONB blob lookup in `applyPhasePreference` fails open on missing-key (Langston nuance B option iii) | Implementation uses fail-hard (option ii) per scope §3 Obj 6 + nuance B disposition; unit test asserts throw | Per nuance B resolution |
| **R-9 NEW** | persistent-state path `/home/deploy/dawntrader/data/` permissions issue | Probe confirmed `chmod 755 deploy:deploy` ownership; existing paper-trade files prove writable | Per nuance C resolution |

---

## §8 — Open items deferred to Step 2 v2 OR Step 3

- **DB query during chunk A:** enumerate `regime_classifier.xstock_spot.*` to confirm which TFS-desat constants are seeded vs missing (impacts §5 seed group 5 count).
- **DB query during chunk A:** enumerate `path_b_sustainability.xstock_spot.*` to confirm B79.0n.MCE seed completeness (impacts §5 seed group 8 count).
- **UI grep during Step 3 planning OR Step 7 verification:** find any hardcoded crypto_spot accessor paths in `client/src/**/regime/*.tsx` or dashboard components.
- **Chunk H final tsc + vitest:** the authoritative caller-surface count emerges from tsc after Chunks B+D land — the §3 table is the pre-audit estimate.

---

## §9 — Sequencing summary (post-Nuance G)

Step 3 chunks (revised 7-chunk plan):

| # | Chunk | Files | Estimated LOC delta |
|---|---|---|---|
| 1 | Migration SQL | `drizzle/migrations/2026-05-25-b79-0n-confidence-chain-per-class-seed.sql` | +~250 lines (60+ rows; comments) |
| 2 | B+D combined — modulator signatures + FactorAlternateInput arms | 7 modulator files + `factor-ablation-builders.ts` | +~200 (signature changes) +~80 (arms) |
| 3 | MCE refresh + per-class accessors | `market-context-engine.ts` | +~300 (7 refresh refactors + 7 accessor refactors + 7 cache fields) |
| 4 | Chain-composition consumer threading | `signal-orchestrator.ts` + `vts-runner.ts` | +~30 (16 push sites + 2 capture-and-reuse blocks) |
| 5 | outcome-feedback store key migration | `outcome-feedback-store.ts` + `regime-phase.ts` (path move only) | +~120 (key shape, disk-load migration, path constants) |
| 6 | Unit tests (4 new + 9 existing updates) | `server/tests/unit/*.ts` | +~600 (40 new tests + 94 updates) |
| 7 | Local tsc + vitest + baseline:check | (verification only — no code) | — |

**Estimated total LOC:** +~1280 (+1280 / 0 — pure additions; no removals beyond legacy-path renames).

---

---

## §10 — v1.1 ADDENDUM: Langston Step 2 clarifications resolved

### §10.1 — Clarification 1 — Legacy-file disposition (uniform pattern)

**Decision:** **No rename. Prefer-new-path order.**

Chunk 5 implements:

1. Constructor of `OutcomeFeedbackStore` + `RegimePhaseStore` reads from the NEW path (`/home/deploy/dawntrader/data/<file>.json`) FIRST. If present, load + done.
2. If new path is ABSENT, read from the legacy `/tmp/<file>.json`. If present, load + immediately write to the new path. Legacy file stays in place at the old `/tmp/` location (it will be wiped on next pm2 restart anyway).
3. **HARD-FAIL on partial corrupt new-path data.** If the new path JSON parse fails, the constructor throws `[B67.4][outcomeFeedbackStore][load-corrupt] new-path JSON is unparseable — cowardly refusing to silently fall back to legacy /tmp/ data which may be stale. Manual investigation required.`. NO silent fallback to legacy when new path is corrupt — per Langston nuance D caveat.
4. Per the §1.6 atomicity finding, both stores' constructors run synchronously at import resolution before any close-hook can fire — no race.

**Unit test pattern (in `b79-0n-confidence-chain-outcome-feedback-isolation.test.ts`):**

```ts
describe('legacy-vs-new path resolution', () => {
  it('new path present → loads from new, ignores legacy', () => { ... });
  it('only legacy present → loads from legacy, writes to new', () => { ... });
  it('new path corrupt + legacy present → throws hard, does NOT silently fall back', () => { ... });
  it('both absent → cold-start empty state', () => { ... });
});
```

### §10.2 — Clarification 2 — Paper-execution-engine caller surface (R-10)

**Confirmed undercount.** Grep of `paper-execution-engine.ts:2019-2065`:

- Line 2021: `_b67_2_1_mce = getMarketContextEngine()`
- Line 2023: `_b67_2_1_ctx = _b67_2_1_mce?.getCachedContext(signal.symbol, resolveAssetClass(signal.symbol, 'kraken'))` — ✅ already per-class
- **Line 2024: `_b67_2_1_macro = _b67_2_1_mce?.getCurrentMacroContext() ?? null`** — ❌ global, needs assetClass threading
- **Line 2025: `_b67_2_1_phaseWeights = _b67_2_1_mce?.getCurrentPhaseWeights() ?? null`** — ❌ global, needs assetClass threading
- Line 2028: `_b67_2_1_phaseWeights[\`${signal.strategy}_${_b67_2_1_phase}\`]` — global blob lookup, needs per-class blob

**Caller-surface table revision** (§3):

| Function | OLD count | NEW count | Added sites |
|---|---|---|---|
| `MCE.getCurrentMacroContext` | not in original table | 3 | paper-execution-engine:2024 |
| `MCE.getCurrentMacroConfig` | 2 | 3 | paper-execution-engine (if accessed) |
| `MCE.getCurrentPhaseWeights` | 2 | **3** | paper-execution-engine:2025 |
| Discriminated-union `kind: 'b67_2'` arms | 16 (8+8) | **16+1=17** if paper-exec rebuilds emit an alternate (verify) |

**Threading approach for paper-execution-engine.ts trade-close hook:** the same `resolveAssetClass(signal.symbol, 'kraken')` value computed at line 2023 is reused for both new per-class accessor calls. Single capture-and-reuse block per the B79.0n.PATTERN-DETECT Step 9 pattern.

**Action item for Chunk B+D:** add the paper-execution-engine sites to the threading checklist explicitly.

**R-10 added to §7 risk register below.**

### §10.3 — Clarification 3 — xstock strategy count (CONFIRMED 9)

**DB probe 2026-05-25:** `SELECT strategy FROM module_constants WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND constant_name='enabled' AND value::text='true' ORDER BY strategy;` returns 9 rows. Explicit list of 9 enabled xstock strategies:

1. `breakout`
2. `inside_bar_reversal`
3. `mean_reversion`
4. `morning_star`
5. `pivot_shift`
6. `range_trade`
7. `sma_trend_ride`
8. `vwap_bounce`
9. `vwap_pullback`

**JSONB blob row count for `regime_phase.xstock_spot.strategy_phase_weights`:** 9 strategies × 3 phases (EARLY / PRIME / LATE) = **27 cells** at neutral 1.0 initial.

**Migration enumerates** `strategy_gates.xstock_spot.*.enabled=true` rows at run-time, NOT a hardcoded list — so a future strategy enablement automatically forces a missing-key throw at first xstock signal that uses that strategy, triggering the seed-row addition.

**Note on the 10 disabled strategies** (abcd_long, adaptive_flow, defensive_hedge, dhma, liquidity_trap, orb, reverse_impulse, strong_bull_trend, support_bounce, volatility_edge): NOT seeded in the xstock_spot weights blob. If any of these get enabled in a future batch, the migration for that batch MUST seed the relevant 3 phase rows alongside the gate flip. Risk that this is forgotten is mitigated by the fail-hard on missing-key at signal-time.

### §10.4 — Clarification 4 — MCE refresh atomicity (atomic Map-replace pattern)

**Pattern adopted for §2 / Chunk 3 design:**

```ts
// BEFORE (in-place mutation — drift risk):
private macroConfigByClass: Map<AssetClass, MacroModifierConfig> = new Map();
private async refreshMacroConfig(): Promise<void> {
  for (const assetClass of ASSET_CLASSES) {
    const config = await resolvePerClass(assetClass);
    this.macroConfigByClass.set(assetClass, config);  // in-place mutation; readers can see partial state
  }
}

// AFTER (atomic Map-replace — no drift window):
private macroConfigByClass: ReadonlyMap<AssetClass, MacroModifierConfig> = new Map();
private async refreshMacroConfig(): Promise<void> {
  const nextMap = new Map<AssetClass, MacroModifierConfig>();
  for (const assetClass of ASSET_CLASSES) {
    nextMap.set(assetClass, await resolvePerClass(assetClass));
  }
  this.macroConfigByClass = nextMap;  // single-reference replace; readers see either old state OR new state, never mixed
}
```

**Pattern applies to all 7 refresh methods** in MCE. The cache field type becomes `ReadonlyMap<AssetClass, T>` so accidental in-place mutation is a TypeScript error.

**Accessor pattern:**

```ts
getCurrentMacroConfig(assetClass: AssetClass): MacroModifierConfig {
  const cfg = this.macroConfigByClass.get(assetClass);
  if (!cfg) {
    throw new Error(`[B79.0n.CONFIDENCE-CHAIN][missing-class] MCE.getCurrentMacroConfig(${assetClass}) — no cached config for asset class. Refresh hasn't fired yet OR class not in ASSET_CLASSES enum.`);
  }
  return cfg;
}
```

Throw-on-missing per Langston D-5 disposition. Cold-start window: the very first refresh cycle on process boot MAY return undefined briefly; consumers are expected to not call accessors before `MCE.start()` completes its first refresh (which IS awaited at boot).

**R-11 added to §7 risk register below.**

### §10.5 — UI grep (nuance F) — RESOLVED clean

Pre-batch grep of `client/src/` for hardcoded crypto-only modulator readers:

```
client/src/pages/analytics.tsx:1448  // commentary line — universe enum doc string
client/src/pages/analytics.tsx:1455  type 'equity_spot' | 'equity_perp' | 'crypto_spot'  — universe enum
client/src/pages/analytics.tsx:1493  'crypto_spot' → 'Crypto pairs'  — display-mapping
client/src/pages/analytics.tsx:3271  comment ref to BATCH_82 crypto_spot context  — explicit per-tab rendering
```

NONE of these are load-bearing for the confidence chain — all are universe-enum / display-mapping / commentary. The `xstocks-tab.tsx` exists as the xstock UI surface; it reads from xstock-specific endpoints already.

**Nuance F resolution:** clean. No in-batch UI scope creep. Step 7 / Step 8 verification will confirm no live render breakage.

### §10.6 — Risk register additions

**R-10 — Ablation-rebuild trade-close hook runs against wrong per-class config if `assetClass` not threaded through.**

- **Severity:** HIGH (silently wrong factor values pollute the outcome-feedback EMA → feedback contaminates b67_4 modulator → bad calibration data over time).
- **Detection:** would not surface in compile (existing global accessor signatures don't fail-loud); only surfaces in data drift over days/weeks of mixed-class trade flow.
- **Mitigation:** Chunk B+D adds paper-execution-engine.ts:2024-2025 to the threading checklist explicitly (§10.2); unit test asserts xstock-trade-close ablation rebuild reads xstock per-class config; PM2 log line includes `asset_class` field on every ablation-rebuild emit for forensic auditability.

**R-11 — Mid-refresh read sees stale xstock + fresh crypto (or vice versa).**

- **Severity:** LOW (configs change rarely; drift self-heals on next refresh).
- **Mitigation:** atomic Map-replace pattern per §10.4. Cache field type is `ReadonlyMap<>` so accidental in-place mutation is a compile error.

### §10.7 — Non-blocking suggestions accepted

- **Step 11 completion report** will include plain-language Kyle-facing note: "xStock pair-correlation modulator ships as off in version 1; the diagnostic panel will show a `compute_disabled: true` flag on every xStock signal until the SPY-relative correlation calibration follow-up batch flips the enable flag."

### §10.8 — Caller-surface revision (consolidated)

Final updated table for §3 (incorporates §10.2):

| Function gaining REQUIRED `assetClass` | Caller sites | New sites added by §10.2 |
|---|---|---|
| `computeMacroModifier` | 1 — MCE | — |
| `computeOutcomeFeedbackFactor` | 2 — signal-orchestrator + vts-runner | — |
| `computeVolumeRegime` | 2 — signal-orchestrator + vts-runner | — |
| `computePairCorrelation` | 2 — signal-orchestrator + vts-runner | — |
| `computeFreshnessFactor` | 2 — signal-orchestrator + vts-runner | — |
| `applyPhasePreference` | 2 — signal-orchestrator + vts-runner | — |
| `outcomeFeedbackStore.updateEma` | 2 — paper-execution-engine + vts-runner | — |
| `outcomeFeedbackStore.peek` | 2 — signal-orchestrator + vts-runner | — |
| `MCE.getCurrentMacroConfig` | 2 → **3** | + paper-execution-engine:2024 |
| `MCE.getCurrentMacroContext` | not tracked → **3** | new surface — paper-execution-engine + sig-orch + vts-runner |
| `MCE.getCurrentPhaseWeights` | 2 → **3** | + paper-execution-engine:2025 |
| `MCE.getCurrentOutcomeFeedbackConfig` | 2 | — |
| `MCE.getCurrentRegimeAgeConfig` | 2 | — |
| `MCE.getCurrentVolumeRegimeConfig` | 2 | — |
| `MCE.getCurrentPairCorrelationConfig` | 2 | — |
| `MCE.getCurrentMultiTfAgreementConfig` | 2 | — |

**Revised total surface estimate:** ~53 distinct call sites across 6 files (was ~50 across 5; added paper-execution-engine.ts as 6th).

---

**End of pre-audit v1.1. All 4 Langston clarifications addressed + 2 new risks added (R-10/R-11) + UI grep clean. Cleared to begin Step 3 Chunk 1.**
