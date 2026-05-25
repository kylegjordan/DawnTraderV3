# B79.0n.CONFIDENCE-CHAIN — Scope (v1)

**Umbrella position:** sub-batch 7 of 18 in the B79.0n umbrella v4 arc (xstock active-trading path enablement). Parallel-eligible with SCORING (#8) and TEC (#9) — depends on STORAGE (#3 closed 2026-05-21).

**Author:** Claude Code, 2026-05-25.
**Reviewer:** Langston Step 1 ACK.
**Status:** v1 — pending Langston review.

> 🚨 **THIS BATCH DOES NOT IMMEDIATELY FUNCTIONALIZE XSTOCK MACRO-MODIFIER OR XSTOCK PAIR-CORRELATION.** It puts the per-class plumbing in place + seeds a per-class no-op disposition for the macro and correlation modulators on `xstock_spot`. Functional macro inputs for equities (VIX / DXY / SPY momentum) and a per-class correlation reference symbol (likely SPY) are deferred to a future Phase 24 macro-feed batch. The plumbing landing here is the architectural prerequisite for that follow-up.

---

## §0 — PREVIOUSLY-STATED-VS-NOW deltas (CLAUDE.md §9.2)

| Item | Previously stated | Now | Reason |
|---|---|---|---|
| Modulator file layout | "`server/core/modulators/b67_1_*.ts` through `b67_4_*.ts` + `b68_1_*.ts` through `b68_5_*.ts`" per Kyle's post-compaction directive 2026-05-25 | Files actually live under `server/core/metrics/` with descriptive names (`macro-modifier.ts`, `regime-phase.ts`, `outcome-feedback-store.ts`, `multi-tf-agreement.ts`, `volume-regime.ts`, `pair-correlation.ts`, `regime-age-factor.ts`). The `b67_X_` / `b68_X_` identifiers are the **factor identifiers** stamped in code + DB rows; they are not file-name prefixes. | Verified via `Grep server/ "b67_1|b67_2|..."` 2026-05-25. No `server/core/modulators/` directory exists. Original directive used a generic mental model; the architectural read corrects to reality. |
| Modulator semantics | Kyle's directive: "b67_1-4 = timeframe / pattern-strength / phase-preference / DBS-confidence; b68_1-5 = regime-age / lookback / cohort-RWR / sample-floor / Path-B-sustainability" | Code reality: **b67_1 = macro-modifier (BTC dominance + funding + crypto mcap)**; **b67_2 = phase-preference (strategy×phase)**; **b67_3 = TFS-desat (in-classifier multiplicative confidence formula)**; **b67_4 = outcome-feedback (per-(regime,strategy) EMA)**; **b68_1 = multi-tf-agreement**; **b68_2 = volume-regime**; **b68_3 = pair-correlation (vs BTC)**; **b68_4 = regime-age / freshness**; **b68_5 = Path-B sustainability gate**. | The pre-compaction directive paraphrase ≠ the canonical semantics. Recovered the canonical taxonomy from each module's header comment + SIM §B69 + B76 ablation map. |
| Pre-audit verdict ("could be no-op") | Umbrella v4 row 7: "could be no-op or could surface per-class parameter need" | **NOT a no-op.** Three of nine modulators have CRITICAL per-class behavioral concerns (b67_1 macro inputs are crypto-native; b67_4 store key omits asset_class causing cross-class outcome contamination; b68_3 correlation reference is hardcoded XBT/USD). Four more have STRUCTURAL per-class concerns (b67_2 strategy weights; b67_3 TFS-desat constants; b68_1 sensitivity; b68_2 thresholds). Only b68_4 + b68_5 are clean-by-construction. | Architectural read 2026-05-25 + DB inventory (`module_constants` rows: 7 of 9 modules have ZERO per-class rows). |

---

## §1 — Sub-batch context

**Position:** umbrella v4 row 7 of 18.
**Dependencies:** STORAGE (#3, closed 2026-05-21), MCE (#4, closed 2026-05-22), STRATEGY (#5, closed 2026-05-23), PATTERN-DETECT (#6, closed 2026-05-24).
**Parallel-eligible with:** SCORING (#8) + TEC (#9).
**Goal:** the confidence-modulator chain that sits between the raw regime classifier and the chain-final `regime_confidence_modulated` value MUST resolve every modulator config + every store key + every reference symbol on `asset_class` as a first-class dimension. No global wildcard fallbacks for any modulator that has behavioral divergence per asset class. Per-class no-op + per-class metadata on the modulators where xstock_spot legitimately lacks a functional input today (`b67_1`, `b68_3`) so the chain remains numerically stable but transparently labelled.

---

## §1.5 — B72 prior-arc context (umbrella v4 §1.5 standing rule)

**B72 (2026-05-05) — `regime_age` module_constants + Path A momentum threshold relocation.** B72 moved the `momentum_floor_path_a` constant from `regime_classifier` to a dedicated `regime_age` module + renamed `b68_5_dbs_slope_min` → `b68_5_path_b_momentum_min`. B70.3 swapped the Path B gate from a slope-min check to a momentum-min check. Net effect: the regime classifier today reads (a) `regime_classifier` for TFS desaturation scales + Path B momentum gate AND (b) `regime_age` for the Path A momentum floor + freshness target/sensitivity. Both modules ARE in scope for CONFIDENCE-CHAIN per-class threading.

**B76 (2026-05-06) — chain-final ablation refactor.** B76 introduced the two-pass `FactorAlternateInput[] stash → buildAllAlternates(stash, realConfFinal, regimeLabel)` pattern across signal-orchestrator + vts-runner. Every modulator now pushes a discriminated-union input record at point-of-fire, and the alternate confidence is computed AFTER the chain-final clamp using `confidenceWithoutFactor = realConfFinal / factor` (divide-out) OR a label-counterfactual re-classification (b68_5). This means CONFIDENCE-CHAIN per-class threading must extend the discriminated-union arms (only `b68_5` has `assetClass: AssetClass` today; the other 7 arms do not carry the pair's asset class) and the chain-composition sites (16 push sites = 8 in signal-orchestrator + 8 in vts-runner) must thread asset class.

**B79.0n.MCE (2026-05-22) — partial confidence-chain assetClass threading already landed.** B79.0n.MCE made `regimePhaseStore.tick`'s `BackfillContext`, `calculatePairRegime`, `computeMultiTfAgreement`, and `buildB68_5Alternate` REQUIRE `assetClass`. It also seeded 2 `regime_classifier` xstock rows + 1 `path_b_sustainability` xstock row. The remaining work for CONFIDENCE-CHAIN: the 7 OTHER MCE config accessors + refresh methods + the 8 OTHER discriminated-union arms + per-class seeding of the 7 remaining modulator modules + the outcome-feedback store key shape.

**B-NEW-43 (2026-05-23) — CI baseline-comparison gate is the safety net.** Every modulator signature change in this batch surfaces compile errors at every caller. The `tsc-baseline.json` gate fails CI if any new error appears at a per-file per-code level. Treat it as the forcing function for caller enumeration — `tsc --noEmit` is the canonical caller-surface probe, not grep.

**BATCH_82 (2026-05-14) — `emitAblationRecord` already REQUIRES assetClass.** The emit-side already enforces per-class via TypeScript. CONFIDENCE-CHAIN extends the same discipline UPSTREAM of the emitter into the chain-composition + config-resolution surface.

---

## §2 — Architectural read summary

### §2.1 — Modulator file inventory

| ID | Semantic | File | Surface | REQUIRED-assetClass today? |
|---|---|---|---|---|
| b67_1 | Macro modifier (BTC dom + funding + mcap) | `server/core/metrics/macro-modifier.ts` | `computeMacroModifier` + `buildB67_1Alternates` | ❌ No |
| b67_2 | Phase preference (strategy×phase) | `server/core/metrics/regime-phase.ts` | `applyPhasePreference` + `buildB67_2Alternate` + `regimePhaseStore` + `BackfillContext` | Partial — `BackfillContext.assetClass` REQUIRED (B79.0n.MCE); accessor still global |
| b67_3 | TFS-desat (multiplicative confidence) | `server/core/metrics/market-regime.ts` (in `calculatePairRegime`) | `calculatePairRegime` | ✅ Yes (B79.0n.MCE made `calculatePairRegime` REQUIRED-assetClass) |
| b67_4 | Outcome-feedback EMA | `server/core/metrics/outcome-feedback-store.ts` | `outcomeFeedbackStore` (singleton) + `computeOutcomeFeedbackFactor` + `buildB67_4Alternate` | ❌ No — store key is `<regime>_<strategy>` with NO asset_class |
| b68_1 | Multi-TF agreement | `server/core/metrics/multi-tf-agreement.ts` | `computeMultiTfAgreement` + `buildB68_1Alternate` | ✅ Yes — `computeMultiTfAgreement(..., assetClass: AssetClass)` (B79.0n.MCE) |
| b68_2 | Volume regime | `server/core/metrics/volume-regime.ts` | `computeVolumeRegime` + `buildB68_2Alternate` | ❌ No |
| b68_3 | Pair correlation (vs BTC) | `server/core/metrics/pair-correlation.ts` | `computePairCorrelation` + `buildB68_3Alternate` | ❌ No |
| b68_4 | Regime age / freshness | `server/core/metrics/regime-age-factor.ts` (`computeFreshnessFactor` + `buildB68_4Alternate`) | freshness factor | ❌ No (config global) |
| b68_5 | Path-B sustainability gate counterfactual | `server/core/metrics/regime-age-factor.ts` (`buildB68_5Alternate`) | label-counterfactual builder | ✅ Yes (B79.0n.MCE) |

### §2.2 — MCE accessor / refresh surface

7 accessor methods on `MarketContextEngine` return GLOBAL configs (no assetClass parameter):
- `getCurrentMacroConfig()` ⟶ `MacroModifierConfig | null` (line 797)
- `getCurrentPhaseWeights()` ⟶ `Record<string, number> | null` (line 825)
- `getCurrentOutcomeFeedbackConfig()` ⟶ `OutcomeFeedbackConfig | null` (line 855)
- `getCurrentRegimeAgeConfig()` ⟶ `RegimeAgeConfig | null` (line 860)
- `getCurrentVolumeRegimeConfig()` ⟶ `VolumeRegimeConfig | null` (line 870)
- `getCurrentPairCorrelationConfig()` ⟶ `PairCorrelationConfig | null` (line 875)
- `getCurrentMultiTfAgreementConfig()` ⟶ `MultiTfAgreementConfig | null` (line 880)

7 corresponding `refreshXConfig()` private methods each resolve with `RES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }` — pure wildcard, no per-class read path today (lines 410, 527, 564, 592, 647, 696, plus phase config at line ~470).

Single config cache field per modulator (`this.macroConfigCache`, `this.phaseWeights`, `this.outcomeFeedbackConfig`, etc.) — single global value, not per-class map.

### §2.3 — Chain-composition consumer sites

**`server/services/signal-orchestrator.ts`** — 8 `_alternateInputs.push({ kind: 'b67_X' / 'b68_X', ... })` sites in the Pass-1 chain composition (lines 724, 759, 781, 798, 821, 867, 918, 944). Each currently reads from the global MCE accessor.

**`server/services/vts-runner.ts`** — same 8 push sites mirrored (lines 1594, 1618, 1638, 1655, 1672, 1713, 1761, 1785).

Combined: **16 production push sites** that must thread `assetClass` into the discriminated-union input record (today, only `kind: 'b68_5'` carries assetClass).

### §2.4 — Factor-ablation-emitter

`emitAblationRecord(source, pairSymbol, realDecision, alternates, assetClass: AssetClass, strategy?)` — already REQUIRES assetClass since BATCH_82 (2026-05-14). No change to the emitter surface; CONFIDENCE-CHAIN just extends the same discipline UPSTREAM of the emitter.

`FactorAlternateInput` discriminated union in `factor-ablation-builders.ts` — 8 arms (`b67_1`, `b67_2`, `b67_4`, `b68_1`, `b68_2`, `b68_3`, `b68_4`, `b68_5`). Only `b68_5` has `assetClass: AssetClass`. **The 7 other arms must gain it.**

### §2.5 — DB row inventory (2026-05-25, staging)

| module_name | `*` rows | `xstock_spot` rows | Per-class seed required? |
|---|---|---|---|
| `macro_modifier` | 12 | 0 | YES — per-class no-op disposition (factor=1.0) + per-class metadata flag |
| `regime_phase` | 3 | 0 | YES — `b67_2_early_phase_max_hours` / `b67_2_prime_phase_max_hours` may differ for xstock RTH cadence; strategy_phase_weights blob already per-class via strategy taxonomy |
| `regime_classifier` | 6 | 2 (B79.0n.MCE) | Already partial — verify TFS-desat scales (`tfsDesatMin/Max`, `tfsMomentumScale`, `tfsVolatilityScale`, `tfsDbsScale`) seed for xstock_spot |
| `outcome_feedback` | 6 | 0 | YES — same config OK; but **store key must become `<assetClass>_<regime>_<strategy>`** (data-layer change) |
| `regime_age` | 5 | 0 | YES — `target_age_hours` likely differs (xstock RTH cadence ~6.5h vs crypto 24/7) |
| `path_b_sustainability` | 2 | 1 (B79.0n.MCE) | Already partial — verify completeness |
| `volume_regime` | 8 | 0 | YES — `accumulation_threshold` / `distribution_threshold` / `liquidation_spike_multiplier` may need per-class tuning post-calibration; v1 clone from crypto |
| `pair_correlation` | 8 | 0 | YES — **`btc_reference_symbol` MUST differ per-class** (xstock_spot likely `SPY`). v1 disposition decision required. |
| `multi_tf_agreement` | 8 | 0 | YES — same sensitivity / thresholds may not need to differ; v1 clone from crypto |

---

## §3 — Numbered objectives (verification criteria embedded)

### Plumbing — REQUIRED-assetClass discipline

1. **`computeMacroModifier(snapshot, baseline, config, assetClass: AssetClass)`** — add REQUIRED `assetClass` parameter. Verification: type-system enforces; `tsc --noEmit` green.

2. **`computeOutcomeFeedbackFactor(entry, config, assetClass: AssetClass)`** — add REQUIRED `assetClass`. Verification: same.

3. **`computeVolumeRegime(ohlcData, config, assetClass: AssetClass)`** — add REQUIRED `assetClass`. Verification: same.

4. **`computePairCorrelation(pairSymbol, pairOhlc, btcOhlc, config, assetClass: AssetClass)`** — add REQUIRED `assetClass`. Verification: same. (Internal: select reference OHLC based on config keyed by assetClass.)

5. **`computeFreshnessFactor(ageMs, config, assetClass: AssetClass)`** — add REQUIRED `assetClass`. Verification: same.

6. **`applyPhasePreference(strategy, phase, weights, baseConfidence, assetClass: AssetClass)`** — add REQUIRED `assetClass`. Verification: same. (Internal: weights blob lookup MAY include assetClass prefix per design decision in §9.)

### Plumbing — MCE per-class config surface

7. **MCE `refreshXConfig()` methods** (7 methods) — refactor to enumerate asset classes from a canonical list, resolve each modulator's constants PER ASSET CLASS, and cache in a `Map<AssetClass, ConfigShape>`. Verification: PM2 logs show `[MCE][refresh] modulator=<name> asset_class=crypto_spot|xstock_spot loaded` for every asset class on first refresh.

8. **MCE `getCurrentXConfig(assetClass: AssetClass)` accessors** (7 accessors) — REQUIRED `assetClass` parameter. Return the per-class config from the map. Throw on missing-class (no silent fallback per CLAUDE.md §5 #15). Verification: `tsc --noEmit` green; runtime fail-hard with clear error message if a class is missing.

### Plumbing — chain-composition consumers

9. **`signal-orchestrator.ts` chain-composition (8 push sites)** — resolve `pairAssetClass` once at entry to the chain block (single `safeResolveAssetClass(symbol, 'kraken')` per CLAUDE.md §5 #15 capture-and-reuse pattern landed in B79.0n.PATTERN-DETECT Step 9), thread into all 8 discriminated-union input records. Verification: all 8 push sites have `assetClass: pairAssetClass`.

10. **`vts-runner.ts` chain-composition (8 push sites)** — same as #9. Verification: all 8 push sites have `assetClass: _pairAssetClass`.

11. **`FactorAlternateInput` discriminated union (7 new arms)** — every arm except `b68_5` (already has it) gains `assetClass: AssetClass`. Verification: `tsc --noEmit` exhaustiveness check passes in `buildOneAlternate`.

12. **`buildXAlternate` builders (7 builders)** — every builder takes `assetClass` and stamps it into the alternate's metadata as `asset_class: assetClass` for downstream dashboard / replay filterability. Verification: unit test asserts metadata contains `asset_class`.

### Data layer

13. **`outcomeFeedbackStore` key shape migration** — change internal Map key from `<regime>_<strategy>` to `<assetClass>_<regime>_<strategy>`. Existing on-disk persist file at `/tmp/b67-4-outcome-feedback.json` MUST be migrated on load (read old shape, re-key with `crypto_spot` prefix since all pre-CONFIDENCE-CHAIN trades are crypto). Verification: PM2 log shows `[B67.4][outcomeFeedbackStore] migrated N keys from legacy <regime>_<strategy> shape to <assetClass>_<regime>_<strategy>` on first boot; subsequent boots load cleanly.

14. **`outcomeFeedbackStore.updateEma(assetClass, regime, strategy, netPnlPct, alpha, now)`** + **`outcomeFeedbackStore.peek(assetClass, regime, strategy)`** — REQUIRED `assetClass` on both. Verification: type-system + close-hook callers updated in `paper-execution-engine.ts` + `vts-runner.ts` (the two trade-close sites that feed the EMA).

15. **DB migration `2026-05-25-b79-0n-confidence-chain-per-class-seed.sql`** — seed per-class rows for the 7 modulator modules currently with zero xstock rows. Per-class disposition per §4 below. Verification: post-migration, `SELECT module_name, asset_class, COUNT(*) FROM module_constants WHERE module_name IN (...) GROUP BY ...` shows non-zero `xstock_spot` rows for all 9 modulator modules.

### Per-class disposition decisions

16. **b67_1 macro-modifier on xstock_spot — PER-CLASS NO-OP (v1).** Seed xstock_spot rows for all 12 constants with values that force the modifier to return `value: 1.0` + `staleDataFlag: false` + `fallbackActive: false` + a new `asset_class_no_op_active: true` flag. Specifically: clamp `modifier_min = 1.0` AND `modifier_max = 1.0` so the formula clamps to identity. Macro-snapshot reads for xstock_spot return a sentinel "n/a for asset class" record. Verification: every xstock_spot signal evaluation emits a B67.1 alternate with `metadata.asset_class_no_op_active = true` + `metadata.value = 1.0`. The chain numerically stable; ablation row labelled. Long-term equity macro (VIX, DXY, SPY momentum) deferred to a Phase 24 macro-feed batch.

17. **b68_3 pair-correlation on xstock_spot — PER-CLASS REFERENCE SYMBOL.** Seed xstock_spot row `btc_reference_symbol = 'SPY/USD'` (or the canonical xstock universe's beta-reference — pre-audit confirms; SPY is the conventional choice). Add `compute_correlation_enabled` constant (default true crypto; default false xstock until SPY OHLC pipeline verified). If `compute_correlation_enabled = false`, factor short-circuits to 1.0 + `metadata.compute_disabled: true`. Verification: xstock_spot signals emit B68.3 alternates with the reference symbol clearly stamped (`metadata.reference_symbol`) + the disabled flag wired correctly until follow-up.

18. **b67_4 outcome-feedback isolation — PER-CLASS KEY.** No cross-class outcome contamination. Crypto trade outcomes update only `<crypto_spot>_<regime>_<strategy>` tuples; xstock trade outcomes update only `<xstock_spot>_<regime>_<strategy>` tuples. Verification: unit test asserts an xstock close does NOT mutate a crypto tuple's EMA and vice-versa.

### Tests + governance

19. **Anti-graveyard discipline.** Zero new `as any`, `@ts-expect-error` (outside dedicated type-lock test file), `@ts-ignore`, or non-null `!`. Baseline of 494 (post-B79.0n.PATTERN-DETECT) unchanged or reduced. Verification: `npm run baseline:check` green at chain close.

20. **Unit test coverage (4 new test files, ~40 tests):**
    - `b79-0n-confidence-chain-required-assetclass.test.ts` — 12 type-lock tests, one per compute / buildAlternate / store-method signature (uses `// @ts-expect-error` to assert calls without assetClass fail to compile).
    - `b79-0n-confidence-chain-outcome-feedback-isolation.test.ts` — 8 tests asserting per-class key isolation (no cross-class EMA leakage; legacy disk-load migration; cold-start per class; etc.).
    - `b79-0n-confidence-chain-mce-per-class-resolve.test.ts` — 12 tests asserting MCE refresh methods read per-class rows + accessors return per-class config + missing-class throws clearly.
    - `b79-0n-confidence-chain-asset-class-no-op.test.ts` — 8 tests for xstock_spot macro no-op + xstock_spot correlation disabled + chain numeric stability (factor=1.0 in every modulator path that's deferred).

21. **Governance updates (Step 10):** SYSTEM_IMPACT_MAP, SYSTEM_MANUAL Chapter on the confidence chain, ASSET_CLASS_ONBOARDING_WORKFLOW (steps 5.x), MULTI_ASSET_VTS_EXPANSION_PLAN Phase 24 row, CLAUDE.md persona §3 modulator inventory line, BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES, RUNNING_ISSUES register row — **all ACTUALLY edited, not just listed**. (Lesson from B79.0n.PATTERN-DETECT close 2026-05-25 where Kyle caught the doc gap on the day-after.)

---

## §4 — Files touched / created / removed

### Created
- `drizzle/migrations/2026-05-25-b79-0n-confidence-chain-per-class-seed.sql` — seed xstock_spot rows for 7 modulator modules + add 2 new constants (`compute_correlation_enabled`, `asset_class_no_op_active` flag handling pattern).
- `server/tests/unit/b79-0n-confidence-chain-required-assetclass.test.ts`
- `server/tests/unit/b79-0n-confidence-chain-outcome-feedback-isolation.test.ts`
- `server/tests/unit/b79-0n-confidence-chain-mce-per-class-resolve.test.ts`
- `server/tests/unit/b79-0n-confidence-chain-asset-class-no-op.test.ts`

### Modified (production)
- `server/core/metrics/macro-modifier.ts` — `computeMacroModifier` + `buildB67_1Alternates` signatures + metadata `asset_class` stamping
- `server/core/metrics/regime-phase.ts` — `applyPhasePreference` signature + `buildB67_2Alternate` signature + per-class weights lookup
- `server/core/metrics/outcome-feedback-store.ts` — store key shape + `updateEma` / `peek` signatures + disk-load migration + `computeOutcomeFeedbackFactor` signature + `buildB67_4Alternate` signature + metadata
- `server/core/metrics/multi-tf-agreement.ts` — `buildB68_1Alternate` signature + metadata (compute signature already has assetClass per B79.0n.MCE)
- `server/core/metrics/volume-regime.ts` — `computeVolumeRegime` + `buildB68_2Alternate` signatures + metadata
- `server/core/metrics/pair-correlation.ts` — `computePairCorrelation` + `buildB68_3Alternate` signatures + per-class reference-symbol resolution + metadata + per-class `compute_correlation_enabled` short-circuit
- `server/core/metrics/regime-age-factor.ts` — `computeFreshnessFactor` + `buildB68_4Alternate` signatures + metadata
- `server/services/market-context-engine.ts` — 7 `refreshXConfig` methods refactored per-class + 7 `getCurrentXConfig` accessors REQUIRED-assetClass + cache field shape `T | null` ⟶ `Map<AssetClass, T>`
- `server/services/factor-ablation-builders.ts` — 7 new `FactorAlternateInput` arm fields + 7 builder dispatch updates
- `server/services/signal-orchestrator.ts` — 8 push sites thread `assetClass` (with `safeResolveAssetClass + skip-on-null` for the resolution at chain-block entry per B79.0n.PATTERN-DETECT Step 9 capture-and-reuse pattern)
- `server/services/vts-runner.ts` — 8 push sites mirror change
- `server/services/paper-execution-engine.ts` — outcome-feedback close hook + `_b67_2_1_*` references gain assetClass threading
- Any other callers surfaced by the compile-driven probe (full enumeration in Step 2 pre-audit)

### Removed
- None. (No legacy code removal expected; this is a pure plumbing batch + per-class seed.)

---

## §5 — Verification gates

1. **Local `npx tsc --noEmit` from `C:\dev\DawnTraderV3` mirror** — green, baseline 494 unchanged.
2. **Local `npx vitest run` from mirror** — all tests pass including the 4 new files.
3. **`npm run baseline:check`** — zero NEW errors per file per code; zero NEW `as any` / `@ts-ignore` outside the dedicated type-lock test file.
4. **Push to GitHub** — CI all 4 jobs GREEN (TypeScript Check, Test Suite, Build, Docker Build) per CLAUDE.md §5 #19.
5. **Staging deploy** — `git pull && npm run db:migrate && npm run build && pm2 restart dawntrader` clean; PM2 logs show `[MCE][refresh] per_class=crypto_spot|xstock_spot` for every modulator on first refresh; HTTP 200 on `/api/health`.
6. **First-pass verification (CC):** psql confirms xstock_spot rows seeded for all 9 modulator modules; PM2 logs show no fail-hard throws on missing-class lookup; xstock signal evaluations show B67.1 alternates with `asset_class_no_op_active=true`; B68.3 alternates with the per-class reference symbol stamped.
7. **UI verification via Claude-in-Chrome (CLAUDE.md §9.3):** xstock-spot regime / confidence panels render finite values + display the correct asset_class label; crypto panels unchanged; no NaN / undefined renders.
8. **Second-pass verification (Langston Step 8):** independent psql + PM2 + UI confirmation.

---

## §6 — Risks + mitigations

| Risk | Mitigation |
|---|---|
| **R-1** outcome-feedback store on-disk migration corrupts the legacy `/tmp/b67-4-outcome-feedback.json` and loses crypto trade history | Migration is read-write-rename: read old shape, write new shape to `/tmp/b67-4-outcome-feedback.json.new`, atomic rename. Old file preserved as `.backup` for 24h. Unit test covers the migration round-trip. |
| **R-2** per-class refresh in MCE leaks memory if asset classes are enumerated dynamically without bounded list | Use the canonical `ASSET_CLASSES` const from `shared/asset-classes.ts` as the bounded enumeration source. Cap at 2 entries today (`crypto_spot`, `xstock_spot`). Verification: log line `[MCE][refresh] enumerated=2 classes` on every refresh cycle. |
| **R-3** xstock_spot macro no-op silently lets bad equity inputs flow if a future batch wires macro feed without updating the no-op flag | The `asset_class_no_op_active` flag is checked at the modulator function level (not just at the emit hook). Future-batch enable path must explicitly flip the flag to false + provide non-sentinel snapshot data. Unit test verifies the flag is honored. |
| **R-4** chain-composition site missed during refactor — a single forgotten push site silently passes the wrong assetClass | Compile-driven probe: every `FactorAlternateInput` arm has REQUIRED `assetClass`. Missing field = compile error. The 16 push sites are exhaustively enumerated by tsc. |
| **R-5** B72 + B70.3 leverage `regime_age` constants in `path_b_sustainability` / `regime_classifier` cross-module reads — per-class refactor could break that | Pre-audit explicitly maps cross-module reads (`momentum_floor_path_a` from `regime_age` read in `buildB68_5Alternate` at `regime-age-factor.ts:157`). Per-class resolution honors the same key shape. |
| **R-6** test universe count drifts when adding 4 new test files + per-class assertions — accidental coverage regression on crypto path | Step 5 verification includes "crypto byte-identity regression" lock: every crypto test that passed pre-batch continues to pass post-batch with the same expected outputs. New tests only ADD coverage; never replace. |

---

## §7 — Anti-graveyard discipline

Per CLAUDE.md §5 #15 (NO PATCHES) and §11:

- **Zero `as any` added in production code** (test type-lock file may use `@ts-expect-error` with explicit directive comments).
- **Zero `@ts-ignore`** in production code.
- **Zero non-null assertion `!`** in production code.
- **No optional `assetClass?:` anywhere on a public API.** Every consumer pathway is REQUIRED.
- **No silent fallback constants.** Missing-class lookup throws with a clear `[B79.0n.CONFIDENCE-CHAIN][missing-class]` error message.
- **`safeResolveAssetClass + skip-on-null` capture-and-reuse pattern** at every chain-block entry (per B79.0n.PATTERN-DETECT Step 9 lesson — eliminates per-call throws inside hot loops + caps WARN volume).
- **Pre-existing fail-hard `resolveAssetClass(...)` call sites in vts-runner outside this batch's scope** stay as Phase 19 follow-up (RUNNING_ISSUES #139); CONFIDENCE-CHAIN only fixes the chain-composition + emit-hook sites.

---

## §8 — F-1 / F-2 lever audit

Per the discipline established in B79.0n.STRATEGY + B79.0n.PATTERN-DETECT, every batch must declare whether each modulator's BEHAVIORAL output is **F-1 (class-invariant by construction)** or **F-2 (lever drift, per-class behavior expected)**.

| ID | F-1 or F-2 | Rationale |
|---|---|---|
| b67_1 macro-modifier | **F-2** | Inputs are CRYPTO-NATIVE (BTC dominance, funding rates, crypto mcap). xstock_spot disposition: per-class NO-OP (factor=1.0) until equity macro feed lands. |
| b67_2 phase-preference | **F-2** | Strategy×phase weights blob. Strategies are per-class (B79.0n.STRATEGY). Weights blob must support per-class lookup OR per-class blob. |
| b67_3 TFS-desat | **F-2** | Multiplicative confidence formula inside `calculatePairRegime`. Math is identical per class but the input scales (`tfsDesatMin/Max`, `tfsMomentumScale`, `tfsVolatilityScale`, `tfsDbsScale`) MAY tune per class. B79.0n.MCE already routed this through per-class `regime_classifier` — verify scales were seeded for xstock_spot. |
| b67_4 outcome-feedback | **F-2** | Store key MUST include asset_class. Crypto trade outcomes must NOT feed into the EMA used to modulate xstock signals. |
| b68_1 multi-tf-agreement | **F-1** | The math (Spearman family, 4h higher-TF re-classification) is class-invariant by construction. `calculatePairRegime` re-classification IS per-class via B79.0n.MCE, so the output is naturally per-class without further code change. Config thresholds (sensitivity) MAY differ per class — record as per-class config but math is class-invariant. |
| b68_2 volume-regime | **F-1** | Pure OHLC math. Class-invariant by construction. Thresholds (accumulation, distribution, liquidation-spike multiplier) MAY differ per class — record as per-class config. |
| b68_3 pair-correlation | **F-2** | Reference symbol differs per class. BTC reference is meaningless for xstock_spot. v1: per-class reference + compute-disabled flag for xstock_spot until SPY OHLC pipeline verified. |
| b68_4 regime-age freshness | **F-1** | Math is class-invariant by construction (age vs target). Target age MAY differ per class (xstock RTH cadence vs crypto 24/7) — record as per-class config. |
| b68_5 Path-B sustainability | **F-1** | Class-invariant by construction (already routed through per-class `regime_classifier` via B79.0n.MCE). Re-classification uses per-class thresholds. |

**Summary:** 4 modulators are F-2 (require per-class behavioral logic) — `b67_1`, `b67_2`, `b67_4`, `b68_3`. 5 modulators are F-1 (math class-invariant, config may tune per class).

---

## §9 — Open decisions for Langston (Tier-1 deferrals)

### D-1 — b67_1 macro disposition for xstock_spot

**Proposal:** v1 ships PER-CLASS NO-OP (factor=1.0 with metadata `asset_class_no_op_active: true`). Equity macro inputs (VIX, DXY, SPY momentum) deferred to a Phase 24 macro-feed batch.

**Alternatives considered:**
- (a) Defer the entire b67_1 modulator to a Phase 24 batch; don't even thread assetClass through it here. **Rejected** — leaves the chain non-uniform and a future patch-target. NO PATCHES doctrine (CLAUDE.md §5 #15).
- (b) Ship equity macro inputs in this batch. **Rejected** — significant scope expansion (new feed integration, new baseline rolling stats, new module). Out of scope.

**Decision needed from Langston:** does the per-class no-op disposition match your judgment, or do you see a third option?

### D-2 — b68_3 pair-correlation reference symbol for xstock_spot

**Proposal:** seed `btc_reference_symbol = 'SPY/USD'` for xstock_spot but ship with `compute_correlation_enabled = false` initially. The factor short-circuits to 1.0 + `metadata.compute_disabled: true`. Verifying SPY OHLC pipeline + correlation calibration is a follow-up.

**Alternatives considered:**
- (a) Use a sector-ETF reference per pair (XLF for financials, XLK for tech, etc.). **Rejected** — adds per-pair config complexity that has zero proven calibration value yet. Defer to Phase 25 if calibration shows sector-relative beta matters.
- (b) Skip emit entirely for xstock_spot. **Rejected** — leaves the chain non-uniform.

**Decision needed from Langston:** SPY as the v1 reference (with compute-disabled flag) — agree or alternative?

### D-3 — b67_2 strategy_phase_weights blob shape

**Proposal:** the existing `weights: Record<string, number>` blob (keyed `<strategy>_<phase>`) stays unchanged in code. For per-class, the DB JSONB column gets per-class rows: `regime_phase.crypto_spot.strategy_phase_weights` + `regime_phase.xstock_spot.strategy_phase_weights`. MCE refresh resolves per class. `applyPhasePreference(strategy, phase, weights, baseConfidence, assetClass)` reads the per-class weights blob (caller picks based on assetClass).

**Alternatives considered:**
- (a) Change the blob key shape to `<assetClass>_<strategy>_<phase>`. **Rejected** — bigger refactor; missing-key throw less informative.
- (b) Keep the blob global. **Rejected** — strategy sets are per-class; crypto-only strategies missing from xstock would throw on first xstock signal.

**Decision needed from Langston:** confirm the per-class JSONB row pattern + seed value derivation (clone crypto weights into xstock_spot for v1; calibrate post-deploy if needed).

### D-4 — outcome-feedback store key migration semantics

**Proposal:** on first boot post-deploy, the store reads the legacy `/tmp/b67-4-outcome-feedback.json` file (keys `<regime>_<strategy>`), re-keys every entry to `<crypto_spot>_<regime>_<strategy>` (since pre-CONFIDENCE-CHAIN era was crypto-only), writes the new shape, and renames the old file to `.backup`. xstock_spot starts cold (no prior history) — every xstock close warms up its own per-class EMA.

**Alternatives considered:**
- (a) Discard all legacy history. **Rejected** — wastes ~30d of accumulated EMA data; cold-start re-warmup penalty.
- (b) Stamp legacy entries with `unknown` asset class. **Rejected** — defeats the per-class isolation goal.

**Decision needed from Langston:** confirm the legacy-as-crypto migration semantic.

### D-5 — per-class config refresh enumeration source

**Proposal:** use the canonical `ASSET_CLASSES` const from `shared/asset-classes.ts` as the enumeration source for MCE's per-class refresh loop. Today that gives `['crypto_spot', 'xstock_spot']` — 2 classes. Future classes (perpetuals) automatically pick up per-class refresh once they're added to the const.

**Decision needed from Langston:** confirm the enumeration source choice + the "fail-hard on missing-class lookup" disposition (vs silent fallback to a global wildcard row).

---

## §10 — Out-of-scope (this batch does NOT do)

- Equity macro feed integration (VIX, DXY, SPY momentum). Deferred to Phase 24 macro-feed batch.
- SPY OHLC pipeline + correlation calibration. Deferred to follow-up.
- Sector-relative beta per pair. Deferred to Phase 25 if calibration warrants.
- Phase 19 cleanup of pre-existing throwing `resolveAssetClass(...)` call sites in vts-runner outside chain-composition (RUNNING_ISSUES #139).
- Strategy_phase_weights calibration for xstock_spot. Initial seed clones crypto values; calibration is a post-deploy follow-up.
- Modulator-config calibration values across the board (`volume_regime` thresholds, `multi_tf_agreement` sensitivity, etc.). v1 seeds clone crypto values; calibration is post-deploy.
- Adding new modulators. CONFIDENCE-CHAIN is plumbing + seeding for the existing 9, not additions.

---

## §11 — Asset-class onboarding workflow learnings target

Per CLAUDE.md §3.3 (Phase-24 standing rule), this batch's completion report must include a dedicated section identifying what worked / what surprised us / recurring patterns / concrete edits to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Specific candidate learnings already foreseen:

- **Pattern surfaced:** "every MCE accessor that returns a config should take `assetClass: AssetClass` as a REQUIRED parameter" — extend the §4.x onboarding-step checklist.
- **Pitfall to flag:** "modulators with crypto-native inputs (macro dominance, BTC correlation) become silent garbage on new asset classes if a no-op disposition is not explicitly seeded — the `asset_class_no_op_active` metadata flag pattern should be reusable for similar future situations."
- **Pattern surfaced:** "every store keyed by `<regime>_<strategy>` (or similar) is a candidate for cross-class contamination; key must include `<assetClass>` prefix."
- **Concrete edit proposal:** add a §4.x step for "modulator config surface audit" in the onboarding workflow that enumerates every refresh / accessor / pure-function modulator and confirms per-class threading.

---

## §12 — Sequencing

Estimated implementation chunks (Step 3):
- **Chunk A:** migration SQL (per-class seed + `compute_correlation_enabled` + `asset_class_no_op_active` patterns)
- **Chunk B:** modulator function signatures REQUIRED-assetClass (7 compute functions + 6 buildAlternates + 2 store methods)
- **Chunk C:** MCE refresh + accessor refactor (7 + 7 = 14 method changes)
- **Chunk D:** `FactorAlternateInput` discriminated-union arm extension (7 arms)
- **Chunk E:** chain-composition consumer threading (16 push sites across 2 files + paper-execution-engine close hook)
- **Chunk F:** outcome-feedback store key migration + disk-load read path
- **Chunk G:** unit tests (4 new files, ~40 tests)
- **Chunk H:** local `tsc --noEmit` + `vitest run` + `baseline:check` verification before push

Each chunk is independently reviewable. Chunk B + D + E are compile-driven — tsc enumerates remaining work after each.

---

**End of scope v1. Awaiting Langston Step 1 review.**
