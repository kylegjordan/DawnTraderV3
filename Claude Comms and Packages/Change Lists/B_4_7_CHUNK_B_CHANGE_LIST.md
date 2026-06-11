# B-4.7 chunk B — Step-4 diff-B change list (#163 per-class canonical map source)

> Local commits `4b8c4ce13` + `ba84f2f4a`, NOT pushed — this review gates the push. INFRASTRUCTURE: DO NOT touch /mnt/gdrive; staging does NOT have these commits.
> **EXIT GATE PASSED: bridge JSON byte-identical** — generated pre-restructure (4,361 bytes) vs post-restructure (4,361 bytes), equal with the two timestamp fields masked; all 9 `sync-canonical-bridge.test.ts` contract tests green. tsc baseline OK; full vitest = the identical pre-existing 12-fail set (1,659 pass).

## The restructure (canonical-regime-strategy-map.ts)

1. The authored flat const → **private `CANONICAL_REGIME_STRATEGY_MAP_BASE`** (single authoring point; not exported — no flat reads possible).
2. **`ASSET_CLASS_OVERRIDES` moved VERBATIM from sync-canonical-bridge.ts** into the source module (the deltas now live WITH the map they modify). `ASSET_CLASSES`/`AssetClassKey` exported from here.
3. **`materializeClassMap()`**: kept = base order minus excludes; adds appended via `findStrategyDefinition()` (full def found by key anywhere in base; throws on unknown key — fail-loud authoring guard). Order preserved EXACTLY as the bridge's old derivation → that's what makes byte-identity hold.
4. **`CANONICAL_REGIME_STRATEGY_MAP` re-exported with the SAME NAME and the NEW per-class shape** `Record<AssetClassKey, Record<CanonicalRegimeType, RegimeStrategyMapping>>` — every un-migrated flat reader is a COMPILE ERROR (the B79.0n forcing pattern), matching the runtime JSON shape (BUG-2026-05-31-A dual-shape ambiguity gone).

## Helper split

| Class-AWARE (REQUIRED `assetClass` first param) | Class-FREE (reads BASE — identity/metrics) |
|---|---|
| getStrategiesForRegime, selectRandomStrategy, selectPrimaryStrategy | buildStrategyCache, getTypeForStrategy, getPatternForStrategy |
| selectContextAwareStrategy + MCE getAllowedStrategies (internals re-pointed; the B79.0n.PATTERN-DETECT "plumbing-only" deferral note superseded — the deferred refactor landed) | getRegimeRiskMultiplier, getRegimeMinConfidence (metrics identical across classes by construction) |
| signal-orchestrator getRegimeAllowedStrategies (DEAD — below) | getAllCanonicalStrategies, getAllStrategiesForSignalType, normalize*/display |

**★ DESIGN AMENDMENT made mid-build (flag for your review): `isValidCanonicalCombination` validates over the UNION of the class trees, NOT the base.** My first cut used the base; writing the lock exposed the flaw — the base lacks the xstock-TFS `orb` ADD, so a legitimate xStock combination (TFS+orb) would have been false-rejected by the validation middleware. Union = "canonical in ANY class"; class ELIGIBILITY stays with strategy_gates/getClassMap. Locked in the new test.

## Consumers

- **sync-canonical-bridge.ts**: local ASSET_CLASS_OVERRIDES + buildStrategyToSignalType + the override-derivation RETIRED; `deriveClassSubtree` now reads the materialized tree (defs → favoredStrategies keys in tree order; favoredSignalTypes first-seen distinct). Markdown generators: regime doc per-class sections; strategy registry = first-seen union.
- **vts-real-score.ts** :176/:185 → `getRegimeRiskMultiplier(regime)` (class-free metric; map import dropped).
- **regime-map route**: `regimes` stays crypto (back-compat) + NEW `regimesByAssetClass` both trees.
- **telemetry-aggregator inferStrategy**: `selectPrimaryStrategy(entry.assetClass === 'xstock_spot' ? 'xstock_spot' : 'crypto_spot', regime)` (display path; crypto fallback covers pre-B-4.7 rehydrates).
- **vts-runner** :3350 eval-loop → `getStrategiesForRegime(_pairAssetClass as ..., pairRegime)`; :3407 pattern→strategy lookup searches THIS pair's class tree (a pattern may only match strategies the class is eligible for — membership-correct).
- **signal-orchestrator getRegimeAllowedStrategies**: ZERO callers (active path reads mceContext.regime.allowedStrategies since Phase 13) — made class-aware so the dead path can't misread if revived + Phase-16 register note (#218 family).
- **MCE computeContext** threads its assetClass into getAllowedStrategies → `allowedStrategies` in RegimeContext is now class-true (this also feeds the orchestrator's strategy filtering — the active-path membership read).
- **xstock eval-cycle** :428 → `(ASSET_CLASS, regime)`.
- **client analytics.tsx FrozenHeader** (the chunk-B rider you asked for): existing badge labeled CRYPTO; NEW XSTOCK badge from `perClass.xstock_spot` — regime+score+percentage when LIVE, "IDLE / WARMING" muted state otherwise.

## Tests
- NEW `b47-per-class-map.test.ts` (6 locks): xstock TFS has orb / crypto doesn't; defensive_hedge absent xstock HVU; orb absent ST both + crypto IE, present xstock IE; strong_bull_trend excluded TFS both; metrics identical across trees + helpers read base; union-validation semantics (incl. the false-reject counter-case).
- 4 consumer suites re-pointed to the per-class shape (harmonization / runtime_signal_consistency / signal_mapping_integrity / vts-modernization) — they assert crypto-era structure/identity invariants → crypto tree; aliased imports (`as REGIME_STRATEGY_MAP`, `as regimeStrategyMap`, `selectPrimaryStrategy as getStrategyForRegime`) caught and threaded.

Reply APPROVE / revisions. On APPROVE: push → CI → deploy → §9.3 Claude-in-Chrome UI verification (existing Overview unchanged + the two-class badges + per-class regime visible per scope objective 2) → your Step-8 second pass → governance batch (#162/#163 close; #217/#218/#219 open; SysManual regime sections; SIM incl. the rankingScore intent-vs-wiring correction; checklist 4.7; MULTI_ASSET tracker). No epoch implication by construction (your diff-A ruling).
