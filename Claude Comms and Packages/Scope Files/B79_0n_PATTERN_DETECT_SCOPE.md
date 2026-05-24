# B79.0n.PATTERN-DETECT — Scope (v1)

**Batch:** B79.0n.PATTERN-DETECT (umbrella sub-batch 6 of 18 — Phase 24)
**Dependencies (all CLOSED):** UNIVERSE-DISCOVERY, STORAGE, MCE, STRATEGY (+ HYGIENE, REGISTRY)
**Asset class onboarding target:** xstock_spot
**Author:** Claude Code (CC), 2026-05-24
**Decision-source citations:** umbrella v4 §1.5 row PATTERN-DETECT ("modest shrink — B72 wired `pattern_pool_gates` (1 lever at crypto_spot scope); B72 Slice 3b touched the 6 pattern strategy files. Remaining: pattern recognition modules themselves — audit whether already asset-class-aware via xStock VTS usage; close gaps. Per-class seed for `pattern_pool_gates.xstock_spot.*` rows."), CLAUDE.md §2 Step 1.a (architectural-read-before-scope discipline), CLAUDE.md §3.3 (Phase-24 learning-capture standing rule), CLAUDE.md §5 #15 (NO PATCHES), B79.0n.STRATEGY closure (commit `85ea78e`) which threaded REQUIRED-`assetClass: AssetClass` through the 19 strategy detect surfaces but **did not** touch the upstream pattern-detection layer.

---

## §-2 Sub-batch context — where PATTERN-DETECT sits in the umbrella

- **Position:** 6 of 18 in the umbrella v4 arc (after STRATEGY, parallel-eligible with CONFIDENCE-CHAIN / SCORING / TEC which also depend only on STORAGE).
- **Inherits from STRATEGY (5):** all 19 strategy detect surfaces are now REQUIRED-`assetClass: AssetClass`; `_SE_KEY(strategy, assetClass)` is the canonical resolver-key factory; the 3 pattern strategies (morning_star, inside_bar_reversal, support_bounce) + 5 hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) all thread `assetClass` into `getCachedNumbersForModule('strategy.<name>', _SE_KEY(...))`. **Strategy-side per-class plumbing is done — PATTERN-DETECT does NOT re-thread strategy detect signatures.**
- **B72 prior-arc context (umbrella v4 §1.5 standing rule):** B72 Slice 2c wired `pattern_pool_gates` (1 lever module — RSI bounds + guardrails) via the `pattern-filter-profile.ts` Object.defineProperty getter pattern at `crypto_spot` scope. B72 Slice 3b wired per-strategy `module_constants` modules `strategy.morning_star`, `strategy.pivot_shift`, `strategy.reverse_impulse`, `strategy.defensive_hedge`, `strategy.inside_bar_reversal`, `strategy.support_bounce`, `strategy.adaptive_flow`, `strategy.volatility_edge`. **Pattern recognition primitives themselves were never touched by B72 or by STRATEGY** — `scanPatterns()`, the 6 internal detect functions (`detectPinbar` / `detectEngulfing` / `detectInsideBar` / `detectThreeSoldiers` / `detectMorningStar` / `detectABCD`), `patternToTradeSignal()`, and the `pattern-recognition.ts` preloader all carry crypto-tuned hardcoded thresholds with **zero asset-class awareness today**.
- **PATTERN-DETECT classification:** "modest shrink" per umbrella v4 §1.5. Smaller than STRATEGY (which generalized 19 detect surfaces); larger than CONFIDENCE-CHAIN (likely no-op pre-audit-pending). Plumbing-first, **no per-class numeric tuning** (Layer-3 shadow-mode work, deferred).

---

## §-1 Step 1.a architectural-read deliverable (per CLAUDE.md §2 1.a)

Read BEFORE drafting this scope:

| Component | Path | Read |
|---|---|---|
| **Pattern Recognizer** | `server/services/pattern-recognizer.ts` (601 lines, Directive 10.2 LOCKED) | FULL |
| **Pattern preloader** | `server/core/pattern-recognition.ts` (66 lines, Directive 11.0E.1) | FULL |
| **Pattern-pool filters (crypto)** | `server/asset_classes/crypto_spot/pattern-pool-filters.ts` (77 lines) | FULL |
| **Pattern-pool filters (xstock)** | `server/asset_classes/xstock_spot/pattern-pool-filters.ts` (44 lines) | FULL |
| **Pattern-pool filters (crypto_perp)** | `server/asset_classes/crypto_perp/pattern-pool-filters.ts` (6 lines, placeholder) | FULL |
| **xstock pattern filter** | `server/asset_classes/xstock_spot/pattern-filter.ts` (309 lines) | FULL |
| **xstock eval-cycle pattern integration** | `server/asset_classes/xstock_spot/eval-cycle.ts` (lines 1-500) | RELEVANT REGIONS |
| **xstock lane-eligibility** | `server/asset_classes/xstock_spot/lane-eligibility.ts` (71 lines) | FULL |
| **Canonical regime-strategy map** | `server/config/canonical-regime-strategy-map.ts` (PATTERN_TO_CANONICAL map + normalizePatternToCanonical + selectContextAwareStrategy) | RELEVANT REGIONS |
| **B72 warmup bootstrap** | `server/startup/b72-warmup.ts` (lines 24-94) | FULL |
| **System Manual** | `1-system-manual/SYSTEM_MANUAL.md` (Pattern Recognition Service §1623, preloader §1803, pattern-recognizer.ts inventory §1955, pattern-pool-filters routing §11069-11185, calibration debt §1944, ATR-multiplier crypto-tuned flag §11263) | RELEVANT SECTIONS |
| **System Impact Map** | `1-system-manual/SYSTEM_IMPACT_MAP.md` (Pattern Recognizer §1028 component block + B78 path-relocation block §88 / §704 / §11074 + §1987-1990 "if you change X check Y") | RELEVANT SECTIONS |
| **Live DB `module_constants` `pattern_pool_gates` rows** | Supabase `module_constants` table | 6 rows verified (see §-1.4 below) |

### §-1.1 Caller-surface enumeration (compile-driven probe via `grep`)

**`scanPatterns()` callers — 5 production sites + 3 test sites + 1 diagnostic:**

| File | Lines | Context |
|---|---|---|
| `server/services/pattern-recognizer.ts` | 487, 580 | DEFINITION + class-method wrapper |
| `server/services/signal-orchestrator.ts` | 1355, 1663, 1684-1686 (3× cascade) | crypto active-trading (4 sites total) |
| `server/services/vts-runner.ts` | 941, 3254, 3316 | VTS pool eval (3 sites) |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | 408 | xstock VTS pool eval (1 site) |
| `server/scripts/diagnostic-11.4G.ts` | (diagnostic) | dev tool |
| `server/tests/unit/pattern-recognizer.test.ts` | TEST | regression-lock |
| `server/tests/unit/multi-timeframe.test.ts` | TEST | timeframe-cascade |
| `server/tests/unit/b79-0m-b2-lane-eligibility.test.ts` | TEST | xstock lane eligibility |

**TOTAL when `scanPatterns` gains REQUIRED `assetClass: AssetClass`:** 5 production threading sites (orchestrator x4, vts-runner x3, xstock eval-cycle x1, diagnostic x1) + 3 test files updated for the new signature. (Note: "x4" counts the cascade calls in orchestrator separately; if treated as one logical site = 3 distinct producer routines.)

**`normalizePatternToCanonical()` callers — 4 production sites:**
- `server/services/signal-orchestrator.ts` (lines 88 import, 1723, 1730, plus selectContextAwareStrategy chain)
- `server/services/vts-runner.ts` (lines 85 import, 1022, 1028, 1035, 3269, 3321)
- `server/asset_classes/xstock_spot/eval-cycle.ts` (lines 44 import, 465, 471)
- DEFINITION at `canonical-regime-strategy-map.ts:620`

**`patternToTradeSignal()` callers — TBD (grep shows 1 site in `pattern-recognizer.ts` class method only — likely orphan; pre-audit confirms.)**

**`preloadPatternHistory()` callers — 1 production + 1 test:**
- `server/core/boot_orchestrator.ts` — single boot caller
- `server/tests/unit/vts-modernization.test.ts` — assertion

**`selectContextAwareStrategy()` callers — 2 production + 1 diagnostic:**
- `server/services/vts-runner.ts` — needs pre-audit confirmation whether this caller is still live post-STRATEGY v3.0.0 byAssetClass
- `server/scripts/diagnostic-11.4G.ts` — diagnostic
- DEFINITION at `canonical-regime-strategy-map.ts:637`

### §-1.2 Pattern Recognizer architecture — current state (crypto-only by construction)

`server/services/pattern-recognizer.ts` exports `scanPatterns(candles: Candle[], symbol: string = 'UNKNOWN')` which fans out to 6 internal detect functions. **None of the 6 detect functions accept `assetClass`. None of the thresholds are DB-resolved. All are crypto-tuned hardcoded literals:**

| Pattern | Threshold | Source | Crypto-tune note |
|---|---|---|---|
| PINBAR | wick ≥ 1.5× body (was 2×) | `:121` `:140` literal | B54 relaxation for crypto wicky candles |
| PINBAR | directional dominance: wick > 2× opposite wick | `:121` `:140` literal | retained crypto QA filter |
| ENGULFING | volume spike ≥ 1.2× avg | `:176` literal | crypto liquidity floor |
| INSIDE_BAR | tolerance = 0.001 (0.1%) | `:237` literal | B54 crypto-tip-tolerance |
| THREE_SOLDIERS | opens-in-prev-body tolerance 0.0025 (0.25%) | `:284-285` literal | B54 crypto micro-gap |
| MORNING_STAR | body/range ≥ 0.3 (was 0.4) | `:325` literal | B54 crypto-bearish-wick relaxation |
| MORNING_STAR | doji body/range ≤ 0.3 | `:330` literal | crypto-tuned |
| ABCD | Fib retrace 0.350-0.820 (was 0.382-0.786) | `:433` literal | B53 crypto overshoots classical |
| ABCD | min candles 12 (was 15) | `:370` literal | B53 crypto shorter windows |
| `patternToTradeSignal` ATR multipliers | stop 1.5×ATR / target 2.5×ATR | `:553-554` literal | SIM §11263 explicitly flagged as crypto-tuned, "may need different for equity microstructure" |

**Operational reality today:** xStock VTS calls `scanPatterns(candles, symbol)` at `eval-cycle.ts:408` with no asset-class hint. The detect functions apply the same crypto-tuned thresholds to xStock candles. Whether this is empirically correct or empirically wrong is unknown — Layer-3 shadow-mode evidence question. **PATTERN-DETECT is plumbing-only — it surfaces the gap with REQUIRED-`assetClass` discipline without changing any numbers.**

### §-1.3 Preloader architecture — Directive 11.0E.1

`server/core/pattern-recognition.ts` (66 lines): `preloadPatternHistory(candleCount: number = 2000)` is a **stub** — it sets a `patternHistoryLoaded` flag after a `setTimeout(100)` no-op. There is no actual pattern history that gets loaded. The flag is read by `isPatternRecognitionWarmedUp()` and asserted in `vts-modernization.test.ts` only. **Functionally inert in production.**

### §-1.4 DB `module_constants.pattern_pool_gates` rows (live staging, queried 2026-05-24)

| exchange | asset_class | strategy | regime | constant_name | value |
|---|---|---|---|---|---|
| * | crypto_spot | * | * | pattern_final_score_min | 0.45 |
| * | crypto_spot | * | * | pattern_max_position_pct | 0.15 |
| * | crypto_spot | * | * | pattern_rsi_min | 15 |
| * | crypto_spot | * | * | pattern_rsi_max | 85 |
| * | xstock_spot | * | * | final_score_floor | 0.45 |
| * | xstock_spot | * | * | max_position_pct | 0.50 |

**🚨 NAMING-DRIFT BUG (F-2 lever drift):** crypto_spot uses `pattern_final_score_min` + `pattern_max_position_pct`; xstock_spot uses `final_score_floor` + `max_position_pct`. **Same semantic levers, divergent names across asset classes.** This violates the umbrella architectural pattern (per-class scoping is on the `asset_class` column, not on the `constant_name` column). Origin: xstock seed in `2026-05-07-b79-xstock-module-constants.sql` (B79_inherit_crypto era) was written before the naming-convergence discipline was formalized. **PATTERN-DETECT will rename xstock_spot rows to match crypto's nomenclature (Option A under §6 Q-B).**

**🚨 COVERAGE GAP:** xstock_spot is missing `pattern_rsi_min` and `pattern_rsi_max`. The crypto-side pattern-pool RSI gate (15-85 bounds) has no xstock equivalent. Today this is a no-op (xstock pattern filter doesn't currently read these), but downstream consumers (per CONFIDENCE-CHAIN / SCORING work) will surface a fail-hard if the rows are missing when looked up via `getCachedNumberRequired`. **PATTERN-DETECT will seed xstock_spot `pattern_rsi_min`=15 + `pattern_rsi_max`=85 (Option (a) under §6 Q-C).**

**Bonus:** `xstock_spot.di_min_pattern = 10` row in `module_constants` (line 7 of query result) is xstock-only, not a naming-convergence target — it's a path-IMF dependency populated by B79.0m.b2 + B-NEW-14. Left untouched by PATTERN-DETECT.

### §-1.5 AssetClass type narrowing — `crypto_spot/pattern-pool-filters.ts:76`

```ts
export type AssetClass = 'crypto_spot'; // Extend when new asset classes added
```

**Bug:** narrows the type to the crypto-only literal, shadowing the canonical AssetClass shared type at `shared/asset-classes.ts`. Anywhere this re-export is consumed, the consumer gets a crypto-only type guarantee that doesn't match reality. **PATTERN-DETECT will replace with `import type { AssetClass } from '@shared/asset-classes';` and re-export the canonical type.**

### §-1.6 Pattern strategies (B79.0n.STRATEGY post-check)

Sample verification — `server/strategies/morning-star.ts` line 72: `assetClass: AssetClass, // B79.0n.STRATEGY — REQUIRED per-class scope` + line 78: `getCachedNumbersForModule('strategy.morning_star', { ..., assetClass, ... })`. Same pattern in `pivot-shift.ts` line 67 / 73. **Confirmed: all 8 pattern + hybrid strategies are class-aware after STRATEGY closure. PATTERN-DETECT does NOT touch strategy detect signatures.**

---

## §0 Crypto regression invariant — NONE-by-construction

**Hard requirement:** zero behavioral change to crypto_spot trading.

- Detect-function thresholds: **no value changes.** PINBAR wick 1.5×, INSIDE_BAR 0.001 tolerance, ABCD Fib 0.350-0.820 etc. stay byte-identical for crypto.
- Pattern-pool gates: crypto's 4 row names (`pattern_final_score_min`, `pattern_max_position_pct`, `pattern_rsi_min`, `pattern_rsi_max`) stay byte-identical. **ONLY xstock_spot rows get renamed + seeded.**
- `scanPatterns` signature: REQUIRED `assetClass` parameter added. Crypto callers thread the call-site asset class (already known — orchestrator + vts-runner are crypto-only paths). xstock caller already has `ASSET_CLASS = 'xstock_spot'` constant in scope.
- Pattern threshold consumption: stays inline-literal for crypto (no DB lookup added in this batch — defer migration of the 11 detect-function literals to a Layer-3 batch unless Langston wants to scope it in here per §6 Q-A).

Verification: 24h crypto regression check post-deploy = pattern signal generation rate within +/- 5% of pre-deploy baseline + FX5 pool size within +/- 5% + crypto trade-open rate within +/- 1-2 trades/day (per CLAUDE.md §5 rule 13 rolling-window discipline).

---

## §1 What this batch does — purpose statement

Close the silent-crypto-fallback footgun at the pattern-detection layer (the layer upstream of STRATEGY-side per-class plumbing) and rationalize the F-2 naming drift in `pattern_pool_gates.xstock_spot.*`. After PATTERN-DETECT, every entry point into the pattern recognition subsystem (`scanPatterns`, `patternToTradeSignal`, and the preloader if not Phase-16-deferred) **REQUIRES** asset-class scoping by TypeScript signature, and the `pattern_pool_gates` DB rows have converged naming across crypto_spot + xstock_spot. **Per-class numeric tuning of the 6 detect-function thresholds is OUT OF SCOPE** — Layer-3 shadow-mode evidence work, deferred.

---

## §2 What's IN SCOPE (numbered objectives)

1. **`scanPatterns()` REQUIRED `assetClass: AssetClass`** (`server/services/pattern-recognizer.ts:487`). Type-enforced parameter. Compile-driven caller threading.
2. **The 6 internal detect functions** (`detectPinbar`, `detectEngulfing`, `detectInsideBar`, `detectThreeSoldiers`, `detectMorningStar`, `detectABCD`) gain `assetClass: AssetClass` parameter, threaded through from `scanPatterns`. Today this parameter is **plumbing-only** — the detect bodies do not branch on it. Future Layer-3 work can introduce per-class threshold resolution.
3. **`patternToTradeSignal()` REQUIRED `assetClass: AssetClass`** (`server/services/pattern-recognizer.ts:538`). Same plumbing posture as the detect functions. ATR multipliers stay hardcoded (1.5× / 2.5×) per §3 OUT OF SCOPE; per-class tuning is deferred.
4. **`PatternRecognizerService` class wrapper methods** gain the same REQUIRED-`assetClass` parameter (`scanPatterns` + `patternToTradeSignal` instance methods).
5. **Caller-surface threading (5 production + 1 diagnostic + 3 tests):** every `scanPatterns()` call site threads the call-site asset class. Crypto producers (signal-orchestrator + vts-runner) pass `'crypto_spot'` literal; xstock producer (eval-cycle.ts) passes its `ASSET_CLASS = 'xstock_spot'` constant.
6. **DB naming-drift fix:** rename `pattern_pool_gates.xstock_spot.final_score_floor` → `pattern_pool_gates.xstock_spot.pattern_final_score_min` (value `0.45` preserved). Rename `pattern_pool_gates.xstock_spot.max_position_pct` → `pattern_pool_gates.xstock_spot.pattern_max_position_pct` (value `0.50` preserved). Migration file + idempotent shape.
7. **DB seed:** insert `pattern_pool_gates.xstock_spot.pattern_rsi_min = 15` + `pattern_pool_gates.xstock_spot.pattern_rsi_max = 85` (default-clone of crypto values; Layer-3 calibration deferred).
8. **`xstock_spot/pattern-pool-filters.ts`** — rewritten to mirror the crypto_spot Object.defineProperty getter shape. Today this file is a 44-line constants-only leaf; after PATTERN-DETECT it adopts the same `PATTERN_POOL_THRESHOLDS` / `PATTERN_POOL_GUARDRAILS` getter pattern as crypto_spot, with `_PATTERN_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' }` driving the resolver, and the legacy `XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR` literal exports preserved as deprecated shim re-exports (delete in Phase 16).
9. **AssetClass type unification:** replace `export type AssetClass = 'crypto_spot'` at `crypto_spot/pattern-pool-filters.ts:76` with `import type { AssetClass } from '@shared/asset-classes';` + matching re-export. Same fix on `xstock_spot/pattern-pool-filters.ts` if scoped wrong.
10. **`pattern-recognition.ts` preloader (Directive 11.0E.1) disposition:** ONE of (a) thread `assetClass: AssetClass` into `preloadPatternHistory`, change `boot_orchestrator.ts` to call it once per asset class, OR (b) document as Phase 16 cleanup candidate (essentially-dead stub) via RUNNING_ISSUES #136 entry, OR (c) delete the file + boot-call now. **CC recommends (b)** — the preloader is a stub that does nothing meaningful (no actual pattern history is loaded). Threading asset-class through dead code is per-class boilerplate without benefit. **Langston confirms in §6 Q-D.**
11. **`selectContextAwareStrategy` disposition:** pre-audit confirms whether vts-runner.ts caller is still live post-STRATEGY v3.0.0 byAssetClass. If live → extend signature with REQUIRED `assetClass: AssetClass`. If dead → flag for Phase 16 register (#136). **Langston confirms in §6 Q-E.**
12. **`PATTERN_POOL_STRATEGIES` const disposition** (in `crypto_spot/pattern-pool-filters.ts:53-64`): pre-audit confirms whether this 8-entry list is alive post-STRATEGY v3.0.0 byAssetClass JSON shape. If alive → add xstock_spot equivalent. If dead → delete + ship cleanup. **Langston confirms in §6 Q-F.**
13. **Unit tests** (4 new files):
    - (a) `b79-0n-pattern-detect-required-assetclass.test.ts` — TypeScript REQUIRED-`assetClass` type-lock via `@ts-expect-error` pattern (~12-15 directives across scanPatterns + patternToTradeSignal + 6 detect functions + class methods).
    - (b) `b79-0n-pattern-detect-naming-convergence.test.ts` — DB-shape regression-lock asserting `pattern_pool_gates.xstock_spot.pattern_final_score_min = 0.45` exists (Postgres mock test or skip-if-unavailable).
    - (c) `b79-0n-pattern-detect-f1-invariance.test.ts` — F-1 lever audit lock: every `scanPatterns()` call must thread `assetClass`; no `'*'` wildcard threading allowed.
    - (d) `b79-0n-pattern-detect-byte-identity.test.ts` — crypto regression-lock: calling `scanPatterns(sample_pinbar_candles, 'BTC/USD', 'crypto_spot')` produces byte-identical PatternSignal output to the pre-batch behavior (signatures + strengths).
14. **Governance updates (Step 10):** BATCH_CATALOG entry, PHASE_HISTORY row, SYSTEM_IMPACT_MAP additions (per-class plumbing block + naming-drift CLOSURE), SYSTEM_MANUAL updates (pattern-recognizer signature change + naming-convergence pattern), CHANGES_AND_FIXES `CLOSURE-2026-05-XX` entry, RUNNING_ISSUES entries for any Phase 16 register additions (preloader if (b), selectContextAwareStrategy if dead, PATTERN_POOL_STRATEGIES if dead), MULTI_ASSET_VTS_EXPANSION_PLAN log row, ASSET_CLASS_ONBOARDING_WORKFLOW per-class onboarding-learnings section.
15. **MEMORY sync (3 locations):** truth + in-repo + Helsinki Langston.

---

## §3 What's OUT OF SCOPE (explicit deferrals)

- **Per-class numeric tuning of the 11 detect-function thresholds** (PINBAR wick, INSIDE_BAR tolerance, THREE_SOLDIERS opens-in-body, MORNING_STAR body/range, ABCD Fib bounds, etc.). Layer-3 shadow-mode evidence work. Future batch when xStock pattern signal-quality data accumulates.
- **Per-class ATR multiplier tuning on `patternToTradeSignal()` (1.5× / 2.5×).** SIM §11263 flagged but Layer-3 work — needs equity microstructure evidence first.
- **Migration of the 11 hardcoded detect-function literals to `module_constants` resolver** (`getCachedNumberRequired('pattern_pool_gates', 'pinbar_wick_min', _PATTERN_KEY)` etc.). Architecturally consistent with B72 Slice 2c pattern, but expanding the constant surface 11-fold without per-class calibration evidence is YAGNI. Layer-3 prerequisite. **However, Langston may override per §6 Q-A — if the answer is "yes, migrate now while we're already touching this file", scope expands.**
- **xstock-side per-class `PATTERN_POOL_STRATEGIES` list** (3 pattern + 5 hybrid for xstock). This is now governed by the v3.0.0 byAssetClass mapping JSON from STRATEGY — the legacy const at `crypto_spot/pattern-pool-filters.ts:53-64` is likely dead (pre-audit confirms). If dead → delete + ship cleanup (Obj. 12). If alive → CONFIDENCE-CHAIN or SCORING batch handles xstock equivalent.
- **`crypto_perp/pattern-pool-filters.ts` placeholder** stays a 6-line placeholder. B80 (crypto_perp asset class onboarding) populates.
- **Pattern recognition Multi-Timeframe Cascade** (Directive 10.7 — `getTimeframeWeight`, `applyTimeframeWeightedStrength`). Asset-class-invariant pattern math; touched only if Langston flags in §6 Q-A scope expansion.
- **24h crypto regression VTS soak** — handled as standing §10.5 alert (auto-fired 24h post-deploy per CLAUDE.md discipline), not gated inside this batch.

---

## §4 Test plan + verification gates

**Local pre-push gates (mirror clone `C:\dev\DawnTraderV3` per CLAUDE.md §7.1):**
- `npx tsc --noEmit` clean — zero new errors per `.tsc-baseline.json` (B-NEW-43 per-file per-code comparison). Baseline regeneration only if PATTERN-DETECT's threading legitimately shifts pre-existing error line numbers; documented in completion report.
- `npx vitest run server/tests/unit/b79-0n-pattern-detect-*` — all 4 new test files pass.
- `npx vitest run server/tests/unit/pattern-recognizer.test.ts` — 10 existing pattern tests pass (regression lock).
- `npx vitest run server/tests/unit/multi-timeframe.test.ts` — multi-timeframe cascade test passes.
- `npx vitest run server/tests/unit/b79-0m-b2-lane-eligibility.test.ts` — xstock lane eligibility test passes.

**CI gate (per CLAUDE.md §5 #19):** all 4 GitHub Actions jobs GREEN at merge commit (TypeScript Check, Test Suite, Build, Docker Build). Run-ID + green status cited in completion report.

**Staging gates (Step 7 first-pass + Step 8 second-pass per CLAUDE.md §9.3):**
- PM2 healthy, HTTP 200.
- psql verification: `SELECT constant_name, value FROM module_constants WHERE module_name = 'pattern_pool_gates' AND asset_class = 'xstock_spot';` returns exactly 4 rows with converged names (`pattern_final_score_min`, `pattern_max_position_pct`, `pattern_rsi_min`, `pattern_rsi_max`).
- PM2 log: pattern signal generation continues at normal crypto rate (`grep -c '\[10.2\]\[PATTERN\]' /var/log/dawntrader/out.log` ≈ pre-deploy 1h baseline +/- 5%).
- UI verification via Claude-in-Chrome: `/api/xstocks/filter-diagnostics` `patternPerMetric` block shows non-zero `passed` counter once xStock RTH window opens. (Tuesday 2026-05-26 14:30 UTC first opportunity post-Memorial-Day.)

**24h crypto regression check (standing §10.5 alert, auto-fired):** pattern signal rate +/- 5% of pre-deploy baseline.

---

## §5 Numeric deltas (CLAUDE.md §9.2 mandatory)

| Item | Previously stated | Now |
|---|---|---|
| Sub-batch count in umbrella | 18 (rev 4) | 18 (unchanged) |
| Tier-1 sub-batches | 16 | 16 (unchanged) |
| PATTERN-DETECT position | 6 of 18 | 6 of 18 (unchanged) |
| Estimated scope size | "modest shrink" (umbrella v4 §1.5) | "modest" confirmed (8-10 numbered objectives vs STRATEGY's 15) |
| Pattern-recognizer detect functions | unspecified | 6 (PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR, ABCD) |
| `scanPatterns` production caller sites | unspecified | 5 (orchestrator 4 logical, vts-runner 3 sites, xstock eval-cycle 1, diagnostic 1) |
| `scanPatterns` test sites | unspecified | 3 (pattern-recognizer.test.ts, multi-timeframe.test.ts, b79-0m-b2-lane-eligibility.test.ts) |
| New `module_constants.pattern_pool_gates.xstock_spot.*` rows | unspecified | net +2 (pattern_rsi_min + pattern_rsi_max) |
| Renamed xstock_spot rows | unspecified | 2 (final_score_floor → pattern_final_score_min; max_position_pct → pattern_max_position_pct) |
| New unit test files | unspecified | 4 |
| Phase-16 register additions (preloader / `selectContextAwareStrategy` / `PATTERN_POOL_STRATEGIES`) | unspecified | 0-3 (depends on Langston §6 Q-D/Q-E/Q-F) |

---

## §6 Open decisions for Langston

| ID | Question | CC recommendation |
|---|---|---|
| **Q-A** | Migrate the 11 hardcoded detect-function thresholds to `module_constants` resolver in this batch? | **DEFER** to Layer-3 batch. Reasons: (1) per-class numeric tuning needs xStock shadow-mode evidence first; (2) expanding constant surface 11-fold without calibration is YAGNI; (3) keeps PATTERN-DETECT "modest" per umbrella v4 §1.5. **Override:** if Langston says "migrate now while we're already touching this file", scope expands +11 module_constants rows + 11 resolver calls + 11 unit-test assertions. |
| **Q-B** | DB naming-drift fix approach | **Option (i): rename xstock_spot rows to crypto's nomenclature** (`pattern_final_score_min`, `pattern_max_position_pct`). Migration `2026-05-XX-b79-0n-pattern-detect-naming-converge.sql` + idempotent + audit-trail row. Backward-compat shim in `xstock_spot/pattern-pool-filters.ts` (deprecated legacy export, delete in Phase 16). |
| **Q-C** | xstock_spot `pattern_rsi_min` / `pattern_rsi_max` seeding | **Option (a): seed with crypto defaults (15 / 85)** — no missing-row fail-hard risk; Layer-3 tuning later. |
| **Q-D** | `pattern-recognition.ts` preloader (Directive 11.0E.1) disposition | **Option (b): Phase 16 cleanup register entry** — stub is functionally inert (setTimeout(100) no-op + flag-set + boot caller + 1 test). Threading `assetClass` through dead code is per-class boilerplate without benefit. Document the stub in RUNNING_ISSUES #136 and remove in Phase 16 alongside other userId-coupled legacy. |
| **Q-E** | `selectContextAwareStrategy` disposition | **Pre-audit will confirm.** If still live in vts-runner.ts → extend with REQUIRED-`assetClass`. If superseded by STRATEGY v3.0.0 byAssetClass → flag Phase 16 register. |
| **Q-F** | `PATTERN_POOL_STRATEGIES` const (`crypto_spot/pattern-pool-filters.ts:53-64`) disposition | **Pre-audit will confirm.** If still consumed → mirror at xstock_spot. If dead post-STRATEGY → delete + ship cleanup. |
| **Q-G** | `patternToTradeSignal` ATR multipliers per-class tuning | **DEFER** to Layer-3 batch (SIM §11263 flagged but evidence-dependent). PATTERN-DETECT plumbs the parameter — the values stay 1.5× / 2.5× for both crypto and xstock. |
| **Q-H** | Scope expansion warning | If Langston requires Q-A "migrate now" answer, PATTERN-DETECT promotes from "modest" to "medium" — flag for Kyle review before draft v2. |

---

## §7 Sequencing & blast radius

**Sequencing:** PATTERN-DETECT can land in parallel with CONFIDENCE-CHAIN, SCORING, TEC. No blocker for any downstream sub-batch except ORCHESTRATOR (#14, depends on PATTERN-DETECT for `evaluateSymbol` pattern threading) and WIRE-IN (#16). No upstream blocker — STORAGE + STRATEGY are CLOSED.

**Blast radius (per SIM):**
- **MEDIUM** at `scanPatterns()` signature — 5 production threading sites, but each site already has the asset class in scope (orchestrator/vts-runner are crypto-only paths, eval-cycle has `ASSET_CLASS` constant). Mechanical change, compile-driven.
- **MEDIUM** at `pattern_pool_gates.xstock_spot.*` rename — 0 reader sites today consume the legacy names from code (xstock pattern filter reads its own row via `getConstant`), but downstream batches CONFIDENCE-CHAIN / SCORING will start reading via `getCachedNumberRequired` once their per-class plumbing closes. Naming convergence is forward-load-bearing.
- **LOW** at preloader disposition — stub is inert.
- **LOW** at AssetClass type unification — TypeScript-only.

**Cleanup expectations:** the 6 detect-function-internal `assetClass` parameter ADDs are plumbing-only — they show up in tsc baseline as compile-pass changes, no source-suppressions added. The `as any` count stays at the B79.0n.STRATEGY baseline (zero new). Type-lock test file gets ~12-15 `@ts-expect-error` directives in its dedicated harness (same pattern as STRATEGY's `b79-0n-strategy-required-assetclass.test.ts`).

---

## §8 Asset-class onboarding workflow contribution (per CLAUDE.md §3.3 standing rule)

PATTERN-DETECT contributes to `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.x:

- **Step 4.X (proposed):** "Pattern recognition primitives — REQUIRED-`assetClass` discipline." Every detect function + every `scanPatterns`-style fan-out gains REQUIRED `assetClass: AssetClass`. Plumbing-only by default; per-class threshold migration is Layer-3 work.
- **Step 4.Y (proposed):** "Pattern-pool gates naming convergence." Every per-class `module_constants` row in `pattern_pool_gates` (and other pool-gate modules) MUST use class-invariant constant names — the asset-class scoping is on the `asset_class` column, not on the `constant_name` column. Forces immediate naming-convergence at onboarding time.

Detailed wording added during Step 10 governance update.

---

## §9 Ready-for-dispatch checklist

- [x] §-1 architectural read complete (SIM + System Manual + pattern-recognizer.ts + preloader + 2 pattern-pool-filters + xstock eval-cycle + xstock pattern-filter + canonical map + b72-warmup + live DB query)
- [x] §-2 sub-batch context populated with B72 prior-arc per umbrella v4 §1.5
- [x] §0 crypto regression invariant declared NONE-by-construction
- [x] §2 numbered objectives (15 items)
- [x] §3 explicit deferrals
- [x] §4 test plan + 4 verification gates (local + CI + staging psql + 24h soak)
- [x] §5 numeric deltas table (CLAUDE.md §9.2)
- [x] §6 8 open decisions for Langston with CC recommendations
- [x] §7 sequencing + blast radius
- [x] §8 asset-class onboarding workflow contribution
- [ ] Step 1 dispatch to Langston via file-first protocol (CLAUDE.md §6.5.0)
- [ ] Step 1 Telegram one-paragraph summary (Kyle directive 2026-05-24)

---

*End of B79.0n.PATTERN-DETECT scope v1. Iteration to v2 based on Langston's §6 answers + any architectural finding triggered during Step 2 pre-audit.*
