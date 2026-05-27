# B79.0n.ORCHESTRATOR — Pre-Audit v1

**Sub-batch:** 12 of 16 in B79.0n umbrella v4 arc
**Predecessor:** B79.0n.RTB (#11) CLOSED 2026-05-27 deploy `6fd6bcac6`
**Scope:** `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_SCOPE.md` v1 ACK clean by Langston 2026-05-27
**Author:** CC
**Reviewer:** Langston (Step 2 review pending)

---

## §1. Pre-audit purpose

Per CLAUDE.md §2 Step 2 mandatory consult of SIM + System Manual. Resolve all 6 §9 probes from scope v1 (5 original + 1 added by Langston in Step 1 review) with code evidence + DB evidence. Confirm or correct Step 1.a assumptions before Step 3 implementation.

---

## §2. Per-component SIM consultation (mandatory per CLAUDE.md §9)

### 2.1 `server/services/signal-orchestrator.ts` (2,106 LOC, 54 assetClass refs)

| Dimension | Finding |
|---|---|
| Upstream | Active Filter Pool (quant + pattern pairs), MCE (regime + indicators), Cost Model (friction via getFrictionForAssetClass — already per-class), Pattern Recognition (scanPatterns + patternToTradeSignal — REQUIRED-assetClass per B79.0n.PATTERN-DETECT), ranking-weights.ts |
| Downstream | SQE (per-class via input.assetClass), RTB (per-class queue depth via B79.0n.RTB), Telemetry |
| Shared state | SYSTEM_GUARDS config (wildcard), DI calculation, deterministic confidence |
| Background execution | Event-driven on Active Filter Pool population (per-pair, per-scan-cycle) |
| Blast radius | **CRITICAL** per SIM §4.1 — every signal flows through here |
| **ORCHESTRATOR touch surface** | Line 101 dead-import cleanup (PATTERN_POOL_GUARDRAILS + PATTERN_POOL_STRATEGIES removed; DEFAULT_ASSET_CLASS preserved). NO other production-code changes in this file. |
| **NOT touched** | Lines 670, 1397, 1525-1592, 1380/1385 — see §3 probe 2 analysis for why |

### 2.2 `server/services/paper-position-sizing.ts` (299 LOC, 2 wildcard reads)

| Dimension | Finding |
|---|---|
| Upstream | VTS learning repository, Price Cache, volatility metrics, PATTERN_POOL_GUARDRAILS config (will become dispatcher-resolved post-batch) |
| Downstream | Paper Execution Engine (consumes size + cap decisions), signal-orchestrator (via sizePaperPositionForSignal) |
| Shared state | maxPositionBufferFactor (module_constants) |
| Background execution | Synchronous — called per signal during sizing |
| Blast radius | **HIGH** per SIM §6.3 — determines capital at risk per trade |
| **ORCHESTRATOR touch surface** | Line 29 import (swap `from '../asset_classes/crypto_spot/pattern-pool-filters.js'` → dispatcher). Line 145 usage (swap direct read → dispatcher call). Function signature update: `sizePaperPositionForSignal` gains REQUIRED `assetClass: AssetClass` param. |

### 2.3 `server/core/filters/signal_quality_evaluator.ts` (SQE)

| Dimension | Finding |
|---|---|
| Upstream | Signal Orchestrator (scored signals with sourcePool + assetClass — already threaded), PATTERN_POOL_GUARDRAILS config (will become dispatcher-resolved), `getSQEThresholdsFromConfig(input.mode, input.assetClass)` per-class threshold reader (already exists per B79.0n.STORAGE) |
| Downstream | RTB Service (only passing signals enter queue) |
| Shared state | sqe_config module_constants (per-class via B79.0n.SCORING) |
| Background execution | Synchronous per signal |
| Blast radius | **HIGH** per SIM §4.2 — controls which signals can become trades |
| **ORCHESTRATOR touch surface** | Line 28 import swap. Line 285 usage swap. Function signature unchanged (input.assetClass already REQUIRED per B79.0n.STORAGE). |

### 2.4 `server/services/asset-class-instances.ts` (factory)

| Dimension | Finding |
|---|---|
| Upstream | Per-class telemetry service, scanner, regime classifier, pattern recognizer |
| Downstream | xstock-spot/scanner.ts (consumes `getXstockSpotInstances().telemetry + scanManager + failureTracker`) |
| Shared state | 3 lazy-init module-level instance caches (`_xstockSpotInstances`, `_xstockPerpInstances`, `_cryptoPerpInstances`) |
| Background execution | Lazy on first call to each `get*Instances()` |
| Blast radius | **LOW** per SIM §B79.0a — factory-only; production reads only the live triad |
| **ORCHESTRATOR touch surface** | Line 86 import deletion (`AdaptiveRatioManager` no longer needed). Line 92 interface field `ratioManager: AdaptiveRatioManager` deletion. Lines 144, 167, 183 — 3 ARM construction calls deletion. |

### 2.5 `server/routes.ts` (line 12645 diagnostic + new endpoint)

| Dimension | Finding |
|---|---|
| Upstream | HTTP requests (no-auth public per B79.0a pattern) |
| Downstream | Dashboard / diagnostic clients |
| Shared state | None (read-only diagnostic) |
| Background execution | On-demand per HTTP request |
| Blast radius | **LOW** — read-only diagnostic |
| **ORCHESTRATOR touch surface** | Line 12645 dynamic-import swap to dispatcher call (per-class via query param). NEW endpoint `GET /api/diagnostics/orchestrator-per-class-state` (returns per-class JSON shape per scope §6.4). |

### 2.6 NEW `server/asset_classes/pattern-pool-dispatch.ts`

| Dimension | Finding |
|---|---|
| Upstream | `shared/asset-classes.ts` (AssetClass type), `crypto_spot/pattern-pool-filters.ts`, `xstock_spot/pattern-pool-filters.ts` |
| Downstream | paper-position-sizing.ts, signal_quality_evaluator.ts, routes.ts:12645, NEW diagnostic endpoint |
| Shared state | None (pure function) |
| Background execution | Synchronous per call |
| Blast radius | **MEDIUM** — 4 downstream consumers; correct dispatch is contract for the F-1 consumer-site swap pattern |
| **ORCHESTRATOR touch surface** | New file ~50 LOC. Exhaustive switch + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws for perp classes + explicit `PatternPoolGuardrails` return type. Domain-specific dispatcher (mirrors `getFrictionForAssetClass` location in `cost-model.ts` rather than central `dispatch.ts` SSOT — see §4 dispatcher-location decision). |

---

## §3. Probes resolution

### Probe 1 — Enumerate ALL callers of `paper-position-sizing` (R-2 mitigation)

Compile-driven grep result:

| Caller site | Function | Disposition |
|---|---|---|
| `server/services/paper-execution-engine.ts:64` | imports `sizePaperPositionForSignal` + `validatePaperPortfolioValue` | Main consumer (active-trading entry path). Will gain REQUIRED `assetClass` arg at call site. |
| `server/services/signal-orchestrator.ts:45` | imports `sizePaperPositionForSignal` | Main consumer (signal-generation path). Will gain REQUIRED `assetClass` arg at call site. |
| `server/services/asset-capabilities.ts:254` | own `calculatePositionSize` method | Different function name + different concept; NOT a caller of `sizePaperPositionForSignal`. Out of scope. |
| `server/services/trade-safety.ts:387` | comment-only reference | Not a real call site. Out of scope. |
| `server/services/trade-safety.ts:844` | own `calculatePositionSize` function | Different function; NOT a caller. Out of scope. |

**Net result: 2 real callers of `sizePaperPositionForSignal`** — both already have `assetClass` available locally (paper-execution-engine via signal metadata; signal-orchestrator via the `_pairAssetClass` resolveAssetClass capture). Chunk B threading adds REQUIRED `assetClass` param at function signature + 2 call-site updates. **R-2 surface remains LOW** (well under Langston's 15-site watch threshold).

### Probe 2 — Signal-orchestrator upstream assetClass drift candidates (Langston Q1 wrong-value-threaded-correctly probe)

Three sites looked-at in signal-orchestrator.ts:

| Line | Source | Disposition |
|---|---|---|
| 585 | `(rawSignal.metadata?.assetClass as AssetClass) || ...` | Reads from rawSignal metadata (set by upstream caller-thread). Class-aware. **NO DRIFT.** |
| 670 | `rawSignal.metadata?.assetClass \|\| DEFAULT_ASSET_CLASS` | Same source as 585 with DEFAULT_ASSET_CLASS fallback. Class-aware with defensible default. **NO DRIFT.** |
| 1397 | `assetClass: DEFAULT_ASSET_CLASS` (hardcoded literal — DEFAULT_ASSET_CLASS = 'crypto_spot') | **By-design crypto-only path.** Comment at lines 1377-1379 explicitly states: *"B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` threaded through scanPatterns + patternToTradeSignal. Signal-orchestrator is the crypto active-trading path — class is crypto_spot by construction."* xStock has its own pattern-path via `server/asset_classes/xstock_spot/eval-cycle.ts`. **NO DRIFT.** |
| 1380 | `scanPatterns(candles, symbol, 'crypto_spot')` (hardcoded) | Same by-design reasoning. **NO DRIFT.** |
| 1385 | `patternToTradeSignal(patternSig, currentPrice, atr, 'crypto_spot')` (hardcoded) | Same by-design reasoning. **NO DRIFT.** |
| 1529 | `assetClass = resolveAssetClass(symbol, 'kraken')` (capture-and-reuse) | Per-class resolution per B79.0n.STRATEGY. Used by lines 1530-1592 strategy-dispatch block. **NO DRIFT.** |

**Net result on probe 2:** signal-orchestrator's "drift candidates" turned out to be by-design crypto-only paths (with explicit docstring at 1377-1379) plus already-correct per-class resolution at 1529. **No drift fix needed in this batch.** Langston's posture (fix-in-batch if drift found) is satisfied vacuously.

**Note on style consistency:** lines 1365 (resolveAssetClass) and 1380/1385 (hardcoded 'crypto_spot') are slightly inconsistent style-wise within the same crypto-only function block. Functionally equivalent. Defer style-normalization to Phase 16 cleanup; not worth expanding scope.

### Probe 3 — DB row health check for xstock_spot pattern_pool_gates (R-3 mitigation)

`SELECT * FROM module_constants WHERE module_name='pattern_pool_gates' ORDER BY asset_class, constant_name`:

```
 module_name        | asset_class | constant_name            | value
--------------------+-------------+--------------------------+-------
 pattern_pool_gates | crypto_spot | pattern_final_score_min  | 0.45
 pattern_pool_gates | crypto_spot | pattern_max_position_pct | 0.15
 pattern_pool_gates | crypto_spot | pattern_rsi_max          | 85
 pattern_pool_gates | crypto_spot | pattern_rsi_min          | 15
 pattern_pool_gates | xstock_spot | pattern_final_score_min  | 0.45
 pattern_pool_gates | xstock_spot | pattern_max_position_pct | 0.50
 pattern_pool_gates | xstock_spot | pattern_rsi_max          | 85
 pattern_pool_gates | xstock_spot | pattern_rsi_min          | 15
```

**All 4 xstock_spot rows present. All 4 crypto_spot rows present.** XSTOCK_PATTERN_POOL_GUARDRAILS DB-resolved getters will return real values when the dispatcher routes xstock signals through.

**Notable behavioral delta:** `pattern_max_position_pct` is **0.50 for xstock vs 0.15 for crypto**. Pre-batch, xstock pattern signals were sized against crypto's 0.15 cap due to the class-bound consumer. Post-batch, xstock pattern signals will correctly route to 0.50. This is a real behavioral correction (not "shadow data pollution") — worth surfacing in scope §10 crypto-regression analysis as a non-crypto-regression but xstock behavior change.

### Probe 4 — Full re-grep for missed `from '../asset_classes/crypto_spot/'` import sites

`grep -rn "from .*asset_classes/crypto_spot" /c/dev/DawnTraderV3 --include="*.ts"`:

| Site | Symbol(s) | Class-bound consumer? |
|---|---|---|
| `server/config/pattern-filter-profile.ts:5` | `export * from '...crypto_spot/pattern-pool-filters.js'` | Re-export shim (legacy back-compat). Not a class-bound consumer per se; transitive callers consume via the shim. Phase 16 removal (RUNNING_ISSUES #73 already filed). Out of scope for ORCHESTRATOR. |
| `server/core/filters/signal_quality_evaluator.ts:28` | `PATTERN_POOL_GUARDRAILS` | **TRUE class-bound consumer.** In scope (Chunk C). |
| `server/core/metrics/market-regime.ts:45` | regime-thresholds constants | Already proper dispatcher (line 245 ternary). NOT class-bound. Out of scope. |
| `server/core/math/cost-model.ts:50` | `CRYPTO_SPOT_FRICTION` | Already proper dispatcher (`getFrictionForAssetClass`). NOT class-bound. Out of scope. |
| `server/services/active-filter-pool.ts:24` | type-only `SourcePool` + `AssetClass` | Type re-exports; not class-bound consumer of behavior. Out of scope. |
| `server/services/paper-position-sizing.ts:29` | `PATTERN_POOL_GUARDRAILS` | **TRUE class-bound consumer.** In scope (Chunk B). |
| `server/services/signal-orchestrator.ts:101` | `PATTERN_POOL_STRATEGIES, PATTERN_POOL_GUARDRAILS, DEFAULT_ASSET_CLASS` | 2 dead imports + 1 legitimate use. In scope (Chunk E). |

**Net surface verified: 3 production consumer sites (paper-position-sizing + SQE + signal-orchestrator-cleanup) + 1 diagnostic site (routes.ts).** No missed surfaces. Scope §2 enumeration confirmed.

### Probe 5 — Diagnostic endpoint route-conflict check

`grep -n "orchestrator-per-class\|/api/diagnostics/orchestrator" /c/dev/DawnTraderV3/server/routes.ts`: zero hits. **No conflict.** New endpoint `GET /api/diagnostics/orchestrator-per-class-state` is novel.

### Probe 6 (added by Langston) — Belt-and-suspenders routes.ts grep for any OTHER PATTERN_POOL_GUARDRAILS / PATTERN_POOL_STRATEGIES consumers

`grep -n "PATTERN_POOL_GUARDRAILS\|PATTERN_POOL_STRATEGIES" /c/dev/DawnTraderV3/server/routes.ts`:

```
12645:      const { PATTERN_POOL_THRESHOLDS, PATTERN_POOL_GUARDRAILS, PATTERN_POOL_STRATEGIES } = await import('./asset_classes/crypto_spot/pattern-pool-filters.js');
12666:          guardrails: PATTERN_POOL_GUARDRAILS,
12667:          strategies: PATTERN_POOL_STRATEGIES,
```

All 3 hits are within the SAME dynamic-import block (the single diagnostic endpoint). Lines 12666 + 12667 are usages within that block, not separate consumers. **No additional consumers in routes.ts beyond line 12645's diagnostic.** Belt-and-suspenders clean.

---

## §4. Dispatcher file location decision (Langston clarifying confirm)

**Probed:** `getFrictionForAssetClass` lives in `server/core/math/cost-model.ts` (line 67) — NOT in a standalone `dispatch.ts`. B79.0n.MCE co-located the dispatcher with the broader cost-model domain code.

**Decision:** create `server/asset_classes/pattern-pool-dispatch.ts` (domain-specific dispatcher, mirroring the MCE pattern) rather than `server/asset_classes/dispatch.ts` (central SSOT).

**Rationale:**
- Mirrors B79.0n.MCE pattern (domain-specific dispatcher location)
- Avoids the all-classes-import coupling of a central dispatch.ts (every future dispatcher would import from every per-class module)
- Lets future domain dispatchers (e.g., strategy-gate dispatch, regime-threshold dispatch) live alongside their domain code
- File name `pattern-pool-dispatch.ts` is self-describing

**Scope update:** Chunk A creates `server/asset_classes/pattern-pool-dispatch.ts` (renamed from earlier `dispatch.ts` proposal). All §5 + §6 scope references updated accordingly in Step 3 chunk header comments.

---

## §5. Crypto-regression analysis refinement

**Confirmed NONE BY CONSTRUCTION:** every swap preserves crypto behavior exactly because:
- Crypto pattern signals continue reading the same `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR = 0.45` and `MAX_POSITION_PCT = 0.15` literal values (dispatcher returns the same object reference for `assetClass='crypto_spot'`)
- Crypto `adaptiveRatioManager` module-level singleton at `adaptive-ratio-manager.ts:307` is UNTOUCHED
- Per-class dispatcher for `assetClass='crypto_spot'` returns the same Object reference the consumers were reading directly

**Notable xstock behavior change (NOT crypto regression):** xstock pattern signals' position-cap will correctly route from crypto's 0.15 to xstock's 0.50 (per Probe 3 DB evidence). Mark in scope §10 + completion report as expected behavioral correction, not a regression.

**Active-trading impact:** ZERO. Active trading is OFF. Behavioral change only observable in VTS-shadow + scanner cycles (which don't size + execute trades).

---

## §6. Risks updated post-pre-audit

R-2 watch — confirmed **LOW** (2 caller sites, well under 15-site threshold).
R-3 confirmed LOW — xstock DB rows healthy, all 4 present.
R-4 stays MEDIUM (integration test mocking depth) — same as scope v1.
R-1/R-5 stay LOW.

**New R-6 (LOW):** xstock_spot `pattern_max_position_pct=0.50` is meaningfully higher than crypto's 0.15. After the dispatcher swap, any xstock pattern signal that enters sizing will be sized against 0.50 cap (vs the pre-batch 0.15 cap). Active-trading impact ZERO today (no xstock signals reach paper execution in shadow mode). When WIRE-IN (#16) flips active trading for xstock, this 0.50 cap takes effect — Phase 19 calibration should validate the 0.50 value (currently a placeholder-clone per B79.0n.PATTERN-DETECT, not Layer-3 evidence-derived). Filed for OBSERVABILITY (#16) calibration window.

---

## §7. Step 3 chunked plan — finalized

| Chunk | File | LOC est. | Risk |
|---|---|---|---|
| A | NEW `server/asset_classes/pattern-pool-dispatch.ts` — `getPatternPoolGuardrailsForAssetClass` + exhaustive switch + perp throws + explicit `PatternPoolGuardrails` return type | ~50 | LOW |
| B | `server/services/paper-position-sizing.ts` — `sizePaperPositionForSignal` signature + 2 callers (paper-execution-engine + signal-orchestrator) | ~15 net | LOW |
| C | `server/core/filters/signal_quality_evaluator.ts` — line 28 import + line 285 dispatcher call | ~3 net | LOW |
| D | `server/routes.ts:12645` — diagnostic per-class dispatcher | ~10 net | LOW |
| E | `server/services/signal-orchestrator.ts:101` — dead-import cleanup (remove PATTERN_POOL_GUARDRAILS + PATTERN_POOL_STRATEGIES; keep DEFAULT_ASSET_CLASS) | ~1 net | LOW |
| F | `server/services/asset-class-instances.ts` — POOL cleanup (3 ARM constructs + interface field + import) | ~20 deletions | LOW |
| G | 3 POOL test file dispositions (delete `b79-0n-telemetry-arm-injection.test.ts`; refactor `b79-0a-arm-injection.test.ts` keep crypto portion; refactor `b79-0b-asset-class-instances.test.ts` if `.ratioManager` referenced) | ~30 net | LOW |
| H | 10 new unit tests in `server/tests/unit/b79-0n-orchestrator-*.test.ts` (4-5 new files: dispatcher, sizing, SQE, signal-orchestrator-imports, factory-interface) | ~150 | LOW |
| I | 3 new integration tests in `server/tests/integration/b79-0n-orchestrator-cascade.test.ts` (anchor + sizing + SQE) | ~100 | MEDIUM |
| J | NEW `/api/diagnostics/orchestrator-per-class-state` endpoint in `server/routes.ts` | ~40 | LOW |
| K | Local tsc + vitest + baseline-comparison verification | — | LOW |

**Total est.** 24-30 hr over 2-3 days. Same as scope v1.

---

## §8. Step 4 readiness checklist (for Step 3 implementation)

When chunks A-K land, the Step 4 change-list dispatch MUST include:
- Embedded diffs for every chunk per CLAUDE.md §6.5.0.a (no /mnt/gdrive navigation by Langston)
- MANIFEST.txt entries for any new migration files (there are none in this batch)
- `package.json` for any new npm scripts (none in this batch)
- Confirmation that `getDefaultCostComponentsForAssetClass` and other existing dispatchers in cost-model.ts remain unchanged (no scope creep into already-correct dispatchers)
- N-numbered non-blocking notes if any inline warns or minor cleanups land alongside

---

## §9. Asks for Langston

1. **§4 dispatcher location decision** — ACK `server/asset_classes/pattern-pool-dispatch.ts` (domain-specific) over central `dispatch.ts` SSOT?
2. **§5 R-6 surface** — agree this xstock 0.50 position-cap behavior change goes to scope §10 + completion report as expected correction (not regression)?
3. **§3 Probe 2 outcome** — agree the by-design crypto-only path at lines 1380/1385/1397 is NOT drift, and we defer style-normalization to Phase 16?
4. **Anything else worth probing before Step 3?**

Reply ACK clean to proceed to Step 3 implementation, or revisions if pre-audit needs iteration.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. This pre-audit file lives at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_PRE_AUDIT.md` after SCP.
