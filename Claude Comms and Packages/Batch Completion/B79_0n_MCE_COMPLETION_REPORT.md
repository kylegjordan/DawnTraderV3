# B79.0n.MCE — Completion Report

> **Sub-batch:** 4 of 18 in the B79.0n umbrella v4 arc.
> **Phase:** 15c continuation / Phase 24 (multi-asset onboarding).
> **Status:** **SHIPPED 2026-05-22**, deploy commit `aa0564107` (PM2 restart #311 at ~12:10Z; migration applied cleanly 1 pending → applied).
> **Langston Step 1 / Step 2 (v2) / Step 4 / Step 8 ACKs** all clean.
> **Standing rules applied:** CLAUDE.md §3.3 Phase-24 onboarding learnings + umbrella rev 4 §1.5 B72 prior-arc context.

---

## §0 — TOP-OF-REPORT mandatory disclaimers

**🟢 THIS IS A CORRECTNESS / TYPE-SAFETY BATCH — FULLY FUNCTIONAL IN WHAT IT DOES; IT IS NOT INERT SCAFFOLDING.** B79.0n.MCE does not by itself enable a new user-facing capability — xStock signals still do not reach the live MCE consumption path (orchestrator → SQE → RTB → executor) until WIRE-IN closes (sub-batch #16). What B79.0n.MCE *does* is structural and immediately effective: it removes the silent `assetClass = 'crypto_spot'` default from three groups of MCE / cost-model surface APIs so that MCE STOPS silently routing xStock callers to crypto's threshold + friction values. That correction is live and verified at runtime as of the 2026-05-22 deploy. The batch is groundwork for the xStock active-trading arc — but the groundwork it lays is real, type-enforced, and functioning, not a placeholder. Per CLAUDE.md §9.1, this is the honest framing: an infrastructure/correctness batch that is fully functional in its own scope, NOT a "does-not-make-X-functional" inert-scaffolding batch.

**🚨 NUMERIC DELTAS (PREVIOUSLY-STATED-VS-NOW):**
- **Caller-site count: scope rev3 estimated ~22 production sites needing REQUIRED-AssetClass touch; actual was ~22.** No material drift — the compile-driven Step 3 audit landed within the scope estimate. (Pre-audit v1's original 27 was corrected to ~22 in pre-audit v2 §0 Correction 3 after reclassifying ~5 global-aggregator / config-introspection sites as not-subject-to-refactor.)
- **`module_constants` row delta: pre-audit v2 said net +2; rev5 (post Q-VI option a) said net +1; shipped at net +1.** The reduction from +2 → +1 is because Q-VI option (a) deleted the dead `cost-metrics.ts` consumer of `cost_model.default_avg_return`, which dropped that constant out of the seed migration entirely. Only `dbs_calculation.min_sample_count` remained (1 wildcard retired + 2 class rows = +1).
- **`cost-metrics.ts` disposition: scope rev5 §3.4.1 said "delete the entire file"; shipped as "delete the dead 3-function chain, KEEP the file."** Step 3 grep proved the file has 6+ live consumers (`computeMarketFriction` / `describeFriction` / `mapFrictionVisual` / `getCachedSpread` / `getCostCache` / `clearCostCache`). Q-VI option (a)'s INTENT (delete the dead chain) is fully honored; only the "whole file" assumption was wrong. Surfaced to Langston in the Step 4 change list §6; concurred.
- **CACHE_REFRESH probe gate: scope rev5 §5.2 #8 expected `N ≥ 2`; observed N = 9** ("picked up 9 module_constants rows ... crypto_spot=1, xstock_spot=8"). The probe counts ALL `dbs_calculation` rows by exact asset_class, not just `min_sample_count`; the higher count includes B-PHASE-A2's `sector_coverage_floor` and other `dbs_calculation` constants. N ≥ 2 satisfied; per-class resolution confirmed.

---

## §1 — Scope objectives — full status checklist

Objectives drawn from `B79_0n_MCE_SCOPE.md` rev5 (§1 objective + §3 code changes + §4 unit tests + §5 acceptance criteria).

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `calculatePairRegime` (`market-regime.ts`) — `assetClass: string = 'crypto_spot'` → `assetClass: AssetClass` REQUIRED; xstock branch unchanged | ✅ YES | Commit `c69320545`. `AssetClass` imported from `shared/asset-classes.ts`; every caller compile-forced to pass it. xstock branch (B78 / B79.0m.b) untouched — silent default removed, not branch logic. |
| 2 | `MarketContextEngine.computeContext` — 7th param REQUIRED `assetClass: AssetClass` | ✅ YES | Commit `c69320545`. TS1016 fix: `smaPeriod?`/`propagatedDbs?` re-ordered to required-but-nullable (`: T \| undefined`) so the REQUIRED param could not follow an optional one; signature-shape-only — no caller change. |
| 3 | `cost-model.ts` 3 functions REQUIRED `AssetClass` + perp fail-hard exhaustive switch | ✅ YES | Commit `c69320545`. `getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics` all REQUIRED. `_unknownAssetClassWarned` warn-once-fallback DELETED. `getFrictionForAssetClass` exhaustive `switch`: spot classes return friction; perp / non-spot classes throw `[B79.0n.MCE][cost-model] assetClass='...' has no friction model wired` pointing to RUNNING_ISSUES; `default: { const _exhaustive: never = assetClass; throw ... }`. Test #2 (`b79-0n-mce-costmodel-perp-failhard.test.ts`) asserts the perp throw. |
| 4 | MCE per-symbol context cache key `${symbol}` → `${symbol}:${assetClass}` | ✅ YES | Commit `c69320545`. Extended at cache read + write + `getCachedContext(symbol, assetClass)`. Pre-audit confirmed no crypto/xStock symbol-namespace overlap (defense-in-depth). Test #3 (`b79-0n-mce-cache-isolation.test.ts`) locks the cache-key contract. |
| 5 | Two ablation paths threaded with `assetClass` (`buildB68_5Alternate` + `computeMultiTfAgreement`) + `BackfillContext` field | ✅ YES | Commit `c69320545`. Both functions gain REQUIRED `assetClass: AssetClass` param threaded to their internal `calculatePairRegime` call; `BackfillContext` type gains REQUIRED `assetClass` field. Callers updated (`factor-ablation-builders.ts`, `signal-orchestrator.ts`, `vts-runner.ts`, `market-context-engine.ts`). Test #6 (`b79-0n-mce-ablation-path-assetclass.test.ts`) locks the type contract. |
| 6 | Seed migration: per-class `dbs_calculation.min_sample_count` rows + wildcard retirement, net +1, EXISTS-gated DELETE, atomic, idempotent | ✅ YES | `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class.sql`. `BEGIN/COMMIT`; 3 steps (add crypto_spot row, add xstock_spot row, EXISTS-gated DELETE of wildcard); `ON CONFLICT DO NOTHING`; WHERE clauses scoped to `constant_name = 'min_sample_count'` exactly. Applied cleanly at deploy (1 pending → applied). `-rollback.sql` companion shipped (manual-only). |
| 7 | B-PHASE-A2 `sector_coverage_floor` xstock_spot row protected from collateral retirement | ✅ YES | Migration WHERE clauses filter `constant_name = 'min_sample_count'` exactly — `sector_coverage_floor` (different `constant_name`) is not matched by any clause. Verified in Step 4 change list §2.1 against `shared/schema.ts`. |
| 8 | Dead-code cleanup (Q-VI option a): delete dead `cost-metrics.ts` chain | ✅ YES | Commit `c69320545`. Deleted `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` (zero production callers — test-only) + `updateSpreadCache` (zero consumers; compile broke when `getCachedCostMetrics` became REQUIRED-assetClass) + now-unused imports/consts. File KEPT (6+ live consumers). `dynamic_sizing.test.ts` dead-chain test block deleted; sibling `getCostClassification` test kept. |
| 9 | `[B79.0n.MCE][CACHE_REFRESH]` boot telemetry probe + `countModuleRowsByAssetClass` helper | ✅ YES | Commit `c69320545`. `logDbsCalculationRowCoverage()` in `market-context-engine.ts` (best-effort; probe failure logs but does not disrupt startup); `countModuleRowsByAssetClass()` in `module-constants-service.ts`. Probe fired at 12:09:52Z post-deploy. |
| 10 | Bar-interval invariant (Q-I): inline comment + stale "15-min" → "60-min" comment fix; no per-class indicator work | ✅ YES | Commit `c69320545`. Inline bar-interval-invariant comment added at `computeMomentum` + `computeADX`; stale "15-min" comment corrected to "60-min". Investigation confirmed all 4 MCE-fed pipelines consume 60-min bars; hardcoded ATR/ADX/Momentum lookbacks kept. |
| 11 | TFS desat NULL finding (Q-III): no `regime_classifier` migration rows; nullification logged | ✅ YES | Pre-audit §5 confirmed TFS desat fields live inline in `market-regime.ts` `DEFAULT_REGIME_CONFIG`, not in `module_constants`. No `regime_classifier` rows added. Nullification logged here for future auditors so the §9(e) question is not re-opened. |
| 12 | 6 new unit tests | ✅ YES | All 6 files present in `server/tests/unit/`: `b79-0n-mce-required-assetclass.test.ts`, `b79-0n-mce-costmodel-perp-failhard.test.ts`, `b79-0n-mce-cache-isolation.test.ts`, `b79-0n-mce-xstock-regime-routing.test.ts`, `b79-0n-mce-required-assetclass-getcachedcostmetrics.test.ts`, `b79-0n-mce-ablation-path-assetclass.test.ts`. All 6 PASS. |
| 13 | Crypto-by-construction-NONE invariant (§6) | ✅ YES | Every removed silent `'crypto_spot'` default became an explicit `'crypto_spot' as const` (or `resolveAssetClass(symbol, 'kraken')` which returns `'crypto_spot'` for crypto symbols). Migration crypto_spot row holds the identical value (`20`) the wildcard held. Cache-key extension changes the key string but not cache content. Perp fail-hard branches unreachable today. Empirical 24h regression-lock soak handed to a scheduled MCE-specific alert created at deploy. |
| 14 | CI — all 4 GitHub Actions checks green | ⚠️ PARTIAL | Build ✅ + Docker ✅ GREEN; all 6 new MCE unit tests ✅ GREEN. TypeScript Check + Test Suite RED — **verified pre-existing debt, NOT an MCE regression** (see §6 below). CI red is owned by the separate batch B-NEW-43 (CI Recovery). |
| 15 | Step 8 Langston second-pass verification | ✅ YES | Langston Step 8 ACK — "B79.0n.MCE shipped clean"; all 4 gates verified (CACHE_REFRESH telemetry fired, HTTP 200, zero fail-hard throws, PM2 stable). |

**14 of 15 objectives GREEN; 1 PARTIAL (objective 14, CI) — the PARTIAL is wholly attributable to pre-existing debt owned by B-NEW-43, not to any MCE code (zero new server TypeScript errors; identical test baseline; all 6 new MCE tests pass — see §6).**

---

## §2 — B72 prior-arc context (umbrella rev 4 §1.5 standing rule)

Per umbrella rev 4 §1.5, every sub-batch's completion report must enumerate (a) what B72/B72.1/B72.2 already did for this subsystem, and (b) what work remained for this sub-batch.

### What B72 already did for MCE-adjacent modules

B72 + B72.1 + B72.2 wired the **API-side discipline** for the MCE-adjacent `module_constants` modules — `regime_classifier`, `regime_age`, `dbs_calculation`, and `cost_model` all became sync-readable via `getCachedNumberRequired` / `getCachedNumbersForModule` with hard-fail on a missing row and no silent fallbacks inside the resolver. B72 did NOT seed per-asset-class rows for these modules — most rows stayed at wildcard `(*, *, *, *)` scope because B72's mandate was the lever-to-DB migration itself, not per-class calibration.

### What B79.0n.MCE picked up vs what stayed deferred

Because B72 already wired the API-side reads, **MCE shrank materially** vs an un-B72'd estimate — the remaining work was the per-class seed row + the REQUIRED-AssetClass type enforcement at the surface APIs, not a lever-to-DB migration.

- **`dbs_calculation.min_sample_count`** — seed migration adds explicit per-class rows + retires the wildcard (net +1). The resolver-key code site (`directional-bias-store.ts:59`) needed NO change — it was already per-class-resolved by B-PHASE-A2 (2026-05-17). Pre-audit v1 incorrectly flagged it for tightening; v2 Correction 1 fixed this after a direct code read.
- **`cost_model.default_avg_return`** — its only consumer (`getDefaultAvgReturn` in `cost-metrics.ts`) was dead code; Q-VI option (a) deleted the dead chain, so the constant dropped out of the seed migration. The now-orphaned row + the stale `b72-warmup.ts` `cost_model` prefetch entry are filed as RUNNING_ISSUES #133 + #134.
- **`regime_age.momentum_floor_path_a`** + **`goals_weighting.ai_weight_cap`** — KEEP WILDCARD (pre-audit §4: pure math threshold + governance cap; cross-class invariant). Inline comments added.
- **`regime_classifier` TFS desat fields** — NULL finding; live inline in `DEFAULT_REGIME_CONFIG`, not in `module_constants`. No rows.

---

## §3 — Architecture summary

### Before B79.0n.MCE

```
[caller A: signal-orchestrator]   [caller B: vts-runner]   [caller C: xstock_spot/eval-cycle]
            │                            │                            │
            │ (no assetClass arg)        │ (no assetClass arg)         │ 'xstock_spot' explicit
            ▼                            ▼                            ▼
            calculatePairRegime(ohlc, dbs, slope, macro, regimeConfig, assetClass = 'crypto_spot')
                                         │
                                         │ assetClass defaults to 'crypto_spot'  ← SILENT DEFAULT
                                         ▼
                          xStock callers silently route through the crypto regime branch
```

Same shape at `MarketContextEngine.computeContext`, `cost-model.getFrictionForAssetClass`, `getDefaultCostComponentsForAssetClass`, and `getCachedCostMetrics` (the last had 9 production callers all passing only `symbol` — an active footgun).

### After B79.0n.MCE

```
[caller A: signal-orchestrator]   [caller B: vts-runner]   [caller C: xstock_spot/eval-cycle]
            │                            │                            │
            │ resolveAssetClass(sym)     │ resolveAssetClass(sym)      │ 'xstock_spot' explicit
            ▼                            ▼                            ▼
            calculatePairRegime(ohlc, dbs, slope, macro, regimeConfig, assetClass: AssetClass)
                                         │
                                         │ assetClass is REQUIRED — TS compile-error if omitted
                                         ▼
                          each caller routes to the correct per-class regime branch;
                          perp / non-spot classes fail-hard via exhaustive switch
```

TypeScript is now the witness: every caller MUST pass an explicit `assetClass` or fail to compile. Crypto-intentional paths pass `'crypto_spot' as const`; asset-class-aware paths thread the cycle's `resolveAssetClass(symbol, 'kraken')`. The MCE per-symbol context cache is keyed `${symbol}:${assetClass}`. The `dbs_calculation.min_sample_count` lever resolves to explicit per-class rows rather than a shared wildcard.

---

## §4 — Files changed

**Step 3-4 implementation commit `c69320545`:** 37 files, +328 / −158 LOC, + 2 NEW migration files + 6 NEW unit-test files.
**Step 5 fix-forward commit `713fd7ae2`:** `getCachedCostMetrics` test-caller args.
**Deploy commit `aa0564107`** (PM2 restart #311 at 2026-05-22T~12:10Z).

### Core surface APIs
- `server/core/metrics/market-regime.ts` — `calculatePairRegime` REQUIRED-AssetClass; bar-interval-invariant inline comments at `computeMomentum` + `computeADX`; stale "15-min" → "60-min" comment fix.
- `server/services/market-context-engine.ts` — `computeContext` REQUIRED-AssetClass; TS1016 fix on `smaPeriod?`/`propagatedDbs?`; per-symbol cache key `${symbol}` → `${symbol}:${assetClass}`; `getCachedContext(symbol, assetClass)`; `regimePhaseStore.tick` object literal gains `assetClass`; NEW `logDbsCalculationRowCoverage()` CACHE_REFRESH probe.
- `server/core/math/cost-model.ts` — `getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics` REQUIRED-AssetClass + exhaustive switch + perp fail-hard; `_unknownAssetClassWarned` flag + warn-once-fallback DELETED.
- `server/services/module-constants-service.ts` — NEW `countModuleRowsByAssetClass()` verification helper.

### Ablation paths
- `server/core/metrics/regime-age-factor.ts` — `buildB68_5Alternate` REQUIRED `assetClass`.
- `server/core/metrics/multi-tf-agreement.ts` — `computeMultiTfAgreement` REQUIRED `assetClass`.
- `server/core/metrics/regime-phase.ts` — `BackfillContext` type gains REQUIRED `assetClass` field.
- `server/core/metrics/factor-ablation-builders.ts` — `FactorAlternateInput.b68_5` variant gains `assetClass`.

### Caller updates (~22 production sites)
- `getCachedCostMetrics` — 10 callers: `xstock_spot/eval-cycle.ts` (file constant `ASSET_CLASS`), `trailing-exit-controller.ts` (in-scope `assetClass`), 8 others (`expectancy.ts`, `ready_to_buy_service.ts`, `signal-orchestrator.ts` ×2, `vts-runner.ts` ×3, `vts-service.ts`) via `resolveAssetClass(symbol, 'kraken')` (STORAGE-established interim, symbol-derived truth, visibly commented).
- `computeContext` callers — `signal-orchestrator.ts` ×2 + `vts-runner.ts` ×2 via `resolveAssetClass`; `eval-cycle.ts:338` already passed `ASSET_CLASS`.
- `getCachedContext` callers — `signal-orchestrator.ts:727`, `vts-runner.ts:1584`, `paper-execution-engine.ts:2022` via `resolveAssetClass`.
- `calculatePairRegime` non-MCE callers — `market-regime.ts` `getDynamicRegimeScore` (advisory) → `'crypto_spot' as const`; `regime-phase.ts` backfill → `ctx.assetClass`; `diagnostic-11.4G.ts` + `b70-b62-relabel-runner.ts` scripts → `'crypto_spot' as const`.
- `signal-orchestrator.ts:~500` — semantic bug fix (umbrella §2.5 green-light): the Phase-15b telemetry block called `mce.computeContext(symbol)` with only a symbol (`computeContext` needs OHLC + price + volume), so the `try/catch` always swallowed the failure and telemetry always emitted `'UNKNOWN'`. Fixed to the correct read-only API `mce.getCachedContext(symbol, resolveAssetClass(symbol, 'kraken'))` + null-safe `mceCtx?.directionalBias`.

### Dead-code deletion
- `server/core/metrics/cost-metrics.ts` — deleted `getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` + `updateSpreadCache` + now-unused imports/consts (file KEPT — 6+ live consumers).
- `server/tests/integration/dynamic_sizing.test.ts` — deleted the dead-chain test block; kept the sibling `getCostClassification` test.

### Seed migration
- `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class.sql` (NEW) — per-class `dbs_calculation.min_sample_count` rows + EXISTS-gated wildcard retirement; atomic; idempotent.
- `drizzle/migrations/2026-05-22-b79-0n-mce-dbs-per-class-rollback.sql` (NEW) — manual-only rollback.

### Unit tests (6 NEW)
- `server/tests/unit/b79-0n-mce-required-assetclass.test.ts`
- `server/tests/unit/b79-0n-mce-costmodel-perp-failhard.test.ts`
- `server/tests/unit/b79-0n-mce-cache-isolation.test.ts`
- `server/tests/unit/b79-0n-mce-xstock-regime-routing.test.ts`
- `server/tests/unit/b79-0n-mce-required-assetclass-getcachedcostmetrics.test.ts`
- `server/tests/unit/b79-0n-mce-ablation-path-assetclass.test.ts`

### Collateral (forced)
- `server/tests/unit/b67-2-phase-dimension.test.ts` — 4 `ctx` object literals got `assetClass: 'crypto_spot' as const` (the `BackfillContext` REQUIRED field change forced this).
- Mechanical test-fixture updates — `calculatePairRegime` test calls got `'crypto_spot' as const` appended across `b67-3-5-tfs-desat.test.ts`, `vts-modernization.test.ts`, `b67-5-prep-floor.test.ts`, `b68-5-path-b-sustainability.test.ts`, `b68-1-multi-tf-agreement.test.ts`.

---

## §5 — Workflow trail (Steps 1-11)

| Step | Verdict | Key items |
|------|---------|-----------|
| Step 1 (scope) | **ACK** (rev2) | Scope rev1 → rev2 → rev3 → rev4 → rev5. rev4 corrected pre-audit v1 errors (directional-bias-store already per-class; cost-metrics dead code; caller over-count). rev5 absorbed Q-VI option (a) dead-code decision. 5 verification asks C1-C5 folded. |
| Step 2 (pre-audit) | **ACK** (v2) | Pre-audit v1 had 3 material errors discovered via Kyle's thoroughness push-back: (1) `directional-bias-store.ts:59` was already per-class-resolved from B-PHASE-A2; (2) `cost-metrics.ts` `getDefaultAvgReturn` chain is dead code (zero production callers); (3) caller-site enumeration over-counted by conflating MCE methods (27 → ~22). v2 corrected all three. Q-VI dead-code disposition raised; Langston chose option (a) absorb. |
| Step 3 (implementation) | — | Commit `c69320545`, 37 files. Compile-driven audit landed within the ~22-site scope estimate. Step 3 grep proved scope rev5's "delete the whole `cost-metrics.ts` file" assumption wrong — file has 6+ live consumers; only the dead chain deleted. |
| Step 4 (code review) | **ACK — clear to push** | Langston ACK with 5 review asks concurred + 4 nits. Asks: §6 Δ dead-chain-not-whole-file disposition; §5 C2 the 8 `resolveAssetClass` interim sites visible + acceptable; §M3 TS1016 fix (required-but-nullable) correct; §5 signal-orchestrator:500 semantic fix correct + in-scope under §2.5 green-light. Change list embedded all load-bearing diff snippets inline per CLAUDE.md §6.5.0.a. |
| Step 5 (fix-forward) | — | Commit `713fd7ae2` — `getCachedCostMetrics` test-caller args. |
| Step 6 (deploy) | — | 2026-05-22 ~12:10Z to staging. Deployed commit `aa0564107`; PM2 restart #311; migration applied cleanly (1 pending → applied). Deploy gated to ≥2026-05-22T12:00Z per Langston C3 so the pre-deploy 24h baseline window sat fully post-STORAGE/UD/HYGIENE stabilization. |
| Step 7 (CC first-pass) | — | HTTP 200. `[B79.0n.MCE][CACHE_REFRESH]` probe fired at 12:09:52Z: "picked up 9 module_constants rows ... crypto_spot=1, xstock_spot=8" — per-class resolution confirmed. Universes loaded (xStock 489 / crypto 422). A boot-time heartbeat spike settled with no recurrence. No new errors. |
| Step 8 (Langston second-pass) | **ACK** | "B79.0n.MCE shipped clean" — all 4 gates verified: CACHE_REFRESH telemetry fired, HTTP 200, zero fail-hard throws, PM2 stable. |
| Step 9 (iterate) | — | No iteration required; all in-window objectives green at first pass. |
| Step 10 (governance) | DONE | See §7. |
| Step 11 (completion report) | DONE | This document. |

---

## §6 — CI status — pre-existing debt, NOT an MCE regression

**The CI TypeScript Check + Test Suite are RED. This is verified pre-existing debt owned by the separate batch B-NEW-43 (CI Recovery). It is NOT a B79.0n.MCE regression.** The evidence:

- **Zero new server TypeScript errors.** B79.0n.MCE added ZERO new server TypeScript errors — the count is actually net **−1** relative to the prior baseline (the `signal-orchestrator.ts:~500` telemetry semantic fix removed one error). The CI red is 100% pre-existing debt: B-NEW-43's documented baseline (run 26255691977) is 696 TypeScript errors with `routes.ts` at 213 and `storage.ts` at 59 — none introduced by MCE.
- **Test failures identical to the prior baseline.** The Test Suite failures are the same ~98 failures present in the STORAGE-era baseline (≈54 module-not-warm, ≈31 assertion, ≈9 DB-connection, 5 stale-knob-mock, 1 vi.mock-hoist) — B79.0n.MCE did not add or change any of them.
- **All 6 new MCE unit tests PASS.** Every test this batch shipped is green.
- **Build + Docker GREEN.**
- **The CI typecheck job carries `continue-on-error: true`** — the documented silent-regression mechanism that B-NEW-43 Phase 1 will remove once typecheck reaches green. The red typecheck does not block the build/docker pipeline.

B-NEW-43 (CI Recovery) is a standalone CI-health batch, Step 2 pre-audit DONE + Langston-ACK'd, scheduled to run after B79.0n.MCE Step 11 closes and before B79.0n sub-batch #5 (STRATEGY). The CI red is its scope, not MCE's.

---

## §7 — Step 10 governance files updated

| Tier | File | Update |
|------|------|--------|
| 1 | `1-system-manual/BATCH_CATALOG.md` | New row: B79.0n.MCE (full technical entry, inserted ahead of the B79.0n.STORAGE row). |
| 1 | `1-system-manual/PHASE_HISTORY.md` | Phase 24 ongoing — B79.0n umbrella arc: added closure entries for sub-batches 2 (UNIVERSE-DISCOVERY), 3 (STORAGE), and 4 (MCE); next sub-batch noted as STRATEGY (#5), gated behind B-NEW-43. |
| 1 | `.claude/memory/MEMORY.md` (truth) | State block — handled by the lead (not edited by this governance pass). |
| 1 | `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) | Synchronized — handled by the lead. |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_MCE_SCOPE.md` | (already shipped Step 1, rev5). |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_MCE_PRE_AUDIT.md` | (already shipped Step 2, v2). |
| 1 | `Claude Comms and Packages/Change Lists/B79_0n_MCE_CHANGE_LIST.md` | (already shipped Step 4). |
| 1 | `Claude Comms and Packages/Batch Completion/B79_0n_MCE_COMPLETION_REPORT.md` | This document. |
| 2 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | New "Recent Additions (B79.0n.MCE ...)" section — 8 component entries (the 3 surface-API groups, the cache-key extension, the ablation-path threading, the seed migration, the dead-code deletion, `countModuleRowsByAssetClass`, the 6 test files) + Modification risks + Telemetry + Cross-references. |
| 2 | `1-system-manual/SYSTEM_MANUAL.md` | Configuration Surface appendix — NEW "Wildcard-retirement migration pattern (B79.0n.MCE)" section + NEW "MCE three-cache-layer model (B79.0n.MCE)" section (the 3-cache-layer table from pre-audit v2 §1.5). |
| 2 | `1-system-manual/RUNNING_ISSUES.md` | 2 new Tier-3 cleanup entries: #133 (orphan `module_constants` row `cost_model.default_avg_return`) + #134 (`b72-warmup.ts` `cost_model` prefetch-list cleanup). |
| 2 | `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | NEW "Step 4.10 — REQUIRED-assetClass on compute-side / math surface APIs + fail-hard exhaustive switch + wildcard-retirement migration (B79.0n.MCE canonical pattern)". |
| 1 | `/home/langston/MEMORY.md` (Hetzner) | To be updated by the lead via scp+ssh per CLAUDE.md §2.10.b. |

---

## §8 — Asset-class onboarding workflow learnings (CLAUDE.md §3.3 mandatory section)

### (a) What worked well — patterns to template

**Type-enforced REQUIRED `assetClass` with an exhaustive-switch fail-hard catches silent-fallback bugs at compile time.** Making `assetClass` REQUIRED on five surface APIs turned the TypeScript compiler into the audit tool — it enumerated every caller. `getCachedCostMetrics` alone had 9 production callers all passing only `symbol`; that is an active footgun that would have silently routed every xStock signal through crypto friction once active-trading enabled. A grep would have undercounted; the compiler did not. This is the same lesson STORAGE surfaced, now reaffirmed on the compute layer. The `default: { const _exhaustive: never = assetClass; throw ... }` exhaustive-switch is the canonical recipe — it is a compile-time tripwire if the `AssetClass` union grows, and the explicit `throw` on a not-yet-wired perp class is a forcing function that makes the next required piece of work visible the moment a perp consumer appears. Reuse: REQUIRED `AssetClass` + exhaustive switch is the default shape for any compute-side function that branches on asset class.

**The EXISTS-gated DELETE migration pattern for wildcard retirement is reusable and has no orphan window.** Retiring a `module_constants` wildcard `(*,*,*,*)` row in favor of explicit per-class rows is a recurring need — the wildcard row serving multiple asset classes is itself a silent-fallback footgun once any caller is per-class-aware. The B79.0n.MCE pattern — add crypto_spot row → add xstock_spot row → DELETE wildcard only `WHERE EXISTS` both replacements — guarantees there is never a moment where the wildcard is gone but the class rows do not yet exist. Combined with `BEGIN/COMMIT` atomicity, `ON CONFLICT DO NOTHING`, exact-`constant_name` scoping, and a sibling `*-rollback.sql`, it is a clean, idempotent, reviewable shape. Reuse: this is now documented in SYSTEM_MANUAL.md and ASSET_CLASS_ONBOARDING_WORKFLOW.md Step 4.10 as the canonical Layer-2 per-class promotion migration.

**Shipping the resolver-key code change and the seed migration in the same commit eliminates both deploy-ordering hazards.** Tightening the resolver before the seed hard-fails every cycle until rows exist; seeding before tightening leaves the wildcard live for an interim. The atomic same-commit pair eliminates both windows — boot order on Hetzner is PM2 restart → migration runs → resolver consults new rows from the first cycle.

### (b) What surprised us — pitfalls to avoid in the next onboarding

**A grep for `assetClass: '*'` produces false positives.** Pre-audit v1 flagged `directional-bias-store.ts:59` for resolver-key tightening on the strength of a grep hit. A direct code read showed the `assetClass` field was already a passed variable, not a literal `'*'` — B-PHASE-A2 had shipped per-class resolution there 4 days earlier. **Rule for the next onboarding:** never scope resolver-key-tightening work from a grep hit alone — open the file and confirm whether the field is a literal `'*'` or a passed variable. This is now codified in ASSET_CLASS_ONBOARDING_WORKFLOW.md Step 4.10.

**Dead inline code chains both linger and carry hygiene debt.** Pre-audit v2 found `cost-metrics.ts`'s `getDefaultAvgReturn → updateCostData → getTransactionCostFactor` chain had zero production callers — an orphan from an earlier directive era. B72 had nonetheless migrated a `module_constants` row (`cost_model.default_avg_return`) for it. Deleting the dead chain (Q-VI option a) then left the migrated row orphaned, plus a stale `b72-warmup.ts` prefetch entry — both filed as RUNNING_ISSUES #133/#134. **Rule:** every onboarding pre-audit must include a "dead code awakens / dead code lingers" check — when a REQUIRED-assetClass refactor touches a subsystem, grep it for zero-production-caller functions; delete them in-batch if small + contained, or file as tracked cleanup. Do not leave orphan code + orphan DB rows undocumented.

**A "delete the whole file" scope assumption can be wrong — verify consumer count at Step 3.** Scope rev5 §3.4.1 said "File to delete: `cost-metrics.ts` (entire file)." The Step 3 grep proved that wrong — the file has 6+ live consumers. The pre-audit had identified the dead *chain* but extrapolated to the *file*. Q-VI(a)'s intent (delete the dead chain) was fully honored; only the file-level assumption was incorrect. **Rule:** a pre-audit that proposes deleting a whole file must back it with an explicit consumer grep, not an extrapolation from "the part I looked at is dead."

**Pre-audit v1 errors were caught only because Kyle pushed for thoroughness.** v1 was an Explore-agent-driven enumeration without sufficient SIM consultation or direct code reads; it had 3 material errors. v2 — produced after Kyle's push-back — corrected all three via direct code reads + SIM citation. The cost of skipping the direct-read discipline at pre-audit is a scope file built on wrong premises. **Rule:** pre-audit caller enumeration and resolver-site flagging must rest on direct code reads, not agent-summarized greps; cite SIM entries by line.

### (c) Recurring structural patterns observed across asset classes

**Every component with an `assetClass?:` optional parameter is a latent silent-fallback bug.** STORAGE found this at the storage API layer; MCE found it at the compute / math layer (`calculatePairRegime`, `computeContext`, the three `cost-model.ts` functions all carried `assetClass: string = 'crypto_spot'`). The pattern is identical regardless of layer: an optional-with-default `assetClass` reads as harmless today (crypto-only routing) and becomes a wrong-answer bug the moment a second asset class routes through. The remediation is identical too: optional → REQUIRED `AssetClass`, force the compile-driven audit, route every caller explicitly. The next onboarding should treat *any* `assetClass?:` in a signature as a defect to be converted, not a convenience to be preserved.

**Compute-side singletons carry multiple cache layers that must not be conflated.** STORAGE extended the SQE service's `${mode}` cache key to `${mode}:${assetClass}`. MCE extended its per-symbol context cache `${symbol}` → `${symbol}:${assetClass}` — but the MCE singleton owns THREE distinct cache layers (per-symbol context, module-constants rowset, 9-group config refresh), and only the first needed extending. The generalizable pattern is "primary identifier + asset-class dimension" for the *cache being scoped*; the trap is conflating sibling caches. Document the cache-layer inventory for any subsystem you touch so the next onboarding does not extend the wrong one. (The MCE 3-cache-layer table is now in SYSTEM_MANUAL.md.)

**`module_constants` levers at wildcard scope are silent-fallback footguns from the per-class lens.** The resolver's wildcard-row support is correct as a *feature* (legitimate scope resolution for genuinely cross-class levers — math constants, governance caps). The *data shape* — a wildcard row serving classes that need independent values — is what makes a specific lever buggy. The fix is always at the data layer (explicit per-class rows + retire wildcard), never the resolver layer. For each wildcard lever a batch touches, the per-lever decision is binary: genuinely cross-class → KEEP wildcard + inline comment (e.g. `regime_age.momentum_floor_path_a`, `goals_weighting.ai_weight_cap`); asset-class-meaningful → wildcard-retirement migration (e.g. `dbs_calculation.min_sample_count`).

### (d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`

Applied in the same governance turn as this completion report:

1. **NEW Step 4.10 — "REQUIRED-assetClass on compute-side / math surface APIs + fail-hard exhaustive switch + wildcard-retirement migration."** Documents (a) the fail-hard exhaustive-switch recipe vs the warn-once-fallback anti-pattern, (b) the compute-side cache-key extension + the multi-cache-layer caveat, (c) the EXISTS-gated wildcard-retirement migration pattern, and the three load-bearing lessons (compiler-as-audit-tool, `grep` false-positive on `assetClass: <var>`, dead-code awakens/lingers check).
2. **`grep` false-positive rule folded into Step 4.10** — "never flag a resolver-key site from a grep hit alone — open the file and confirm whether the `assetClass` field is a literal `'*'` or a passed variable." (Satisfies scope rev5 ask C5.)
3. **"dead code awakens / dead code lingers" pre-audit check folded into Step 4.10** — every onboarding pre-audit greps touched subsystems for zero-production-caller functions; delete in-batch or file as tracked cleanup.

No further filler — the substantive learnings are captured above.

---

## §9 — Deferred follow-ups filed at governance close

- **RUNNING_ISSUES #133 — orphan `module_constants` row `cost_model.default_avg_return`.** Its only consumer (`getDefaultAvgReturn`) was deleted this batch; the row is now orphan data. Low priority (harmless at runtime). Bundle the cleanup with #134.
- **RUNNING_ISSUES #134 — `server/startup/b72-warmup.ts` `cost_model` prefetch-list cleanup.** If `default_avg_return` was the only `cost_model.*` constant read via the sync-read path, the `'cost_model'` entry in `PREFETCH_MODULES` is now dead weight. Verify against remaining `cost_model.*` sync consumers before removing — boot-order-sensitive list.
- **Per-class `dbs_calculation` calibration** (umbrella §1.5 row "MCE", scope §7 #1) — the xstock_spot `min_sample_count` row is a placeholder-clone of the crypto value (`20`); promote to measured per-class calibration when the Phase 19 xStock active-trading enablement gate approaches.
- **`cost_model` per-class lever calibration** (scope §7 #4) — Phase 19 work; xStock cost parameters get measured values when active-trade fill data accumulates.
- **External macro feed per-class signal** — already tracked as RUNNING_ISSUES #123 (filed during the umbrella v1 audit); no new entry needed.

---

## §10 — Locked next steps

1. **24h crypto regression-lock soak** — an MCE-specific 24h soak alert was created at the Step 6 deploy (per umbrella §2.2 per-metric thresholds: FX5 pool ±5%, signal generation ±5%, VTS trade rate ±5%, active-trade-open ±1-2/day OR ±15% 7d). Whoever is at the keyboard when it fires runs the pre/post comparison and acks.
2. **B-NEW-43 (CI Recovery)** runs next — after B79.0n.MCE Step 11 closes and before B79.0n sub-batch #5 (STRATEGY). It owns the pre-existing CI red documented in §6.
3. **B79.0n.STRATEGY (sub-batch #5)** — the next umbrella sub-batch, gated behind B-NEW-43 per the locked sequence.

---

**Batch CLOSED 2026-05-22** (pending Kyle acknowledgment per the canonical 11-step workflow).
