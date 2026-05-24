# B79.0n.PATTERN-DETECT — Pre-Audit (v1)

**Batch:** B79.0n.PATTERN-DETECT (umbrella sub-batch 6 of 18 — Phase 24)
**Step:** 2 of 11 (Pre-implementation audit)
**Author:** Claude Code (CC), 2026-05-24
**Pre-reqs done:** §-1 architectural read complete (scope v1), Langston Step 1 ACK with 8 §6 decisions locked (commit `d050040`).
**Local tsc baseline:** 494 errors (matches `.tsc-baseline.json` frozen at `b0a4292`). Zero regression at pre-audit start.

---

## §-0 Q-B grep cross-check (Langston Step 1 ACK request — load-bearing)

> Langston ACK §6 Q-B: "Before shipping the rename migration, please grep at Step 2 for any string-literal usage of `'final_score_floor'` or `'max_position_pct'` paired with an xstock-asset-class lookup key — not just in `xstock_spot/pattern-pool-filters.ts` but anywhere in `server/` + `shared/` + `scripts/`. If any consumer reads via `getCachedNumberRequired('pattern_pool_gates', 'final_score_floor', { assetClass: 'xstock_spot', ... })` we need to either update that caller in the same migration or add a transitional alias."

### Grep result — comprehensive

| File | Line | Context | DB-read or static? | Action required |
|---|---|---|---|---|
| `server/asset_classes/xstock_spot/pattern-pool-filters.ts` | 12-13 | JSDoc comment block | static (no DB) | None — comment rewrite under §2 obj 8 file rewrite |
| `server/asset_classes/xstock_spot/pattern-pool-filters.ts` | 29, 37, 40-42 | `XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45` + `XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50` + `Object.freeze(...)` literal const exports | **static TS constants — NOT DB-read** | Rewrite under §2 obj 8 (file gets getter shape) — keep legacy exports as deprecated shim |
| `server/asset_classes/xstock_spot/pattern-filter.ts` | 39 | comment block referring to xstock guardrail seed | static (no DB) | Comment update only |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | 33-34 | comment block referring to xstock guardrail seed | static (no DB) | Comment update only |
| (rest of grep hits — `1-system-manual/`, `Claude Comms and Packages/`, `attached_assets/`, `bridge/reference/`) | various | governance docs + historical archives | non-production | No action |

### CRITICAL FINDING

**ZERO production consumers read `'final_score_floor'` or `'max_position_pct'` from the DB paired with an xstock_spot asset-class lookup key.**

Search corpus: `server/**/*.ts`, `shared/**/*.ts`, `scripts/**/*.ts`, plus `server/core/`, `server/strategies/`, `server/asset_classes/`. Grep also checked for the actual resolver call shapes:
- `getCachedNumberRequired('pattern_pool_gates', 'final_score_floor', ...)` → **zero hits**
- `getCachedNumberRequired('pattern_pool_gates', 'max_position_pct', ...)` → **zero hits**
- `getConstant('pattern_pool_gates', 'final_score_floor', ...)` → **zero hits**
- `getConstant('pattern_pool_gates', 'max_position_pct', ...)` → **zero hits**
- `getCachedNumbersForModule('pattern_pool_gates', ...)` → only hit is the bulk-read shape used by crypto getters — but those use the crypto naming (`pattern_final_score_min`, `pattern_max_position_pct`).

**Conclusion:** the two xstock_spot rows (`final_score_floor = 0.45`, `max_position_pct = 0.50`) seeded by `2026-05-07-b79-xstock-module-constants.sql` (B79_inherit_crypto era) are **forward-loaded scaffolding with no current readers**. The rename migration ships zero runtime impact today; it only forward-loads correctly for CONFIDENCE-CHAIN / SCORING when they wire their xstock getter consumers in subsequent sub-batches. **Q-B is SAFE — no transitional alias required. Ship the rename + the file rewrite + the 2 new seed rows in one atomic migration.**

---

## §-1 Q-E disposition — `selectContextAwareStrategy`

### Grep result

Three call sites for `selectContextAwareStrategy`:

| File | Line | Status |
|---|---|---|
| `server/config/canonical-regime-strategy-map.ts` | 637 | DEFINITION |
| `server/services/vts-runner.ts` | 967 | **LIVE CALLER** (crypto VTS path) |
| `server/scripts/diagnostic-11.4G.ts` | (diagnostic) | dev tool |

### vts-runner.ts call-site analysis (full block — lines 952-985)

```ts
if (strategyOverride) {
  signalType = strategyOverride.signalType;
  strategy = strategyOverride.strategyKey;
  canonicalPatternType = (strategyOverride.patternType as PatternType | null) ?? null;
  selectionReason = 'regime_scoped';
} else {
  const sHash = symbolToHash(symbol);
  const strategySelection = selectContextAwareStrategy(
    regime,
    detectedPattern?.pattern ?? null,
    sHash
  );
  signalType = strategySelection.signalType;
  strategy = strategySelection.strategy;
  canonicalPatternType = strategySelection.patternType as PatternType | null;
  selectionReason = strategySelection.selectionReason;
  // ...
}
```

**Status: ALIVE for crypto VTS** — the no-`strategyOverride` branch is the live default code path. Called per-pair-per-eval-cycle. STRATEGY v3.0.0 byAssetClass did NOT supersede this caller — `selectContextAwareStrategy` returns a single picked strategy (with diversity / fallback logic) for a regime; `getFavoredStrategiesForRegime(regime, assetClass)` returns the full strategy LIST for a regime+class. **Different functions, both alive.**

### Disposition

**ADD REQUIRED `assetClass: AssetClass` parameter to `selectContextAwareStrategy(regime, detectedPattern, symbolHash, assetClass)` signature** (PATTERN-DETECT §2 obj 11). Function body reads `CANONICAL_REGIME_STRATEGY_MAP[regime]` today — post-STRATEGY this should route through the v3.0.0 byAssetClass shape via `getFavoredStrategiesForRegime(regime, assetClass)`. Caller threading:

- `vts-runner.ts:967` — crypto VTS, thread `'crypto_spot'` literal (the path is crypto-only).
- `diagnostic-11.4G.ts` — diagnostic tool, thread `'crypto_spot'` literal as default.

**Crypto byte-identity gate:** for crypto callers, after the parameter add, the selection result must equal pre-batch behavior. v3.0.0 byAssetClass JSON for crypto_spot is byte-identical to v2.0.0 flat per STRATEGY closure — verified.

**xStock VTS path uses different code** (`xstock_spot/eval-cycle.ts:411` calls `getStrategiesForRegime(regime)` — different function). PATTERN-DETECT does NOT change xstock eval-cycle.

---

## §-2 Q-F disposition — `PATTERN_POOL_STRATEGIES`, `PATTERN_POOL_THRESHOLDS`, `PATTERN_POOL_GUARDRAILS`, `DEFAULT_ASSET_CLASS`, `SourcePool`

### Consumer enumeration

| Export | Consumers (production) | Status |
|---|---|---|
| `PATTERN_POOL_STRATEGIES` | `routes.ts:12635, 12657` (diagnostic endpoint exposes the list as JSON); `signal-orchestrator.ts:98` (imported but **NOT REFERENCED** in body) | **MOSTLY DEAD** — unused import in orchestrator; only diagnostic endpoint reads. Per `vts-runner.ts:49` comment "Batch 19C import removed by 19G HF1 Item 4: PATTERN_POOL_STRATEGIES no longer used" — was already removed from VTS path. |
| `PATTERN_POOL_THRESHOLDS` | `routes.ts:12635, 12655` (same diagnostic endpoint) | **MOSTLY DEAD** — per `fx5-scanner.ts:101` comment "B54 Fix 4: PATTERN_POOL_THRESHOLDS import removed — all filter thresholds from DB only" — already removed from scanner. Only diagnostic-endpoint reader remains. |
| `PATTERN_POOL_GUARDRAILS` | `signal_quality_evaluator.ts:28, 249` (SQE FINAL_SCORE_FLOOR check) — **ACTIVELY CONSUMED**; `routes.ts:12635` (diagnostic); `signal-orchestrator.ts:98` (unused import) | **ALIVE** — SQE consumer is load-bearing. |
| `DEFAULT_ASSET_CLASS` | `signal-orchestrator.ts:667, 1372` (fallback in metadata) — **ACTIVELY CONSUMED** | **ALIVE** |
| `SourcePool` TYPE | `active-filter-pool.ts:24, 39` (consumes type union) — **ACTIVELY CONSUMED** | **ALIVE** |

### Disposition (3 sub-decisions)

1. **`PATTERN_POOL_STRATEGIES` — ALIVE but diagnostic-only.** Do NOT add xstock mirror (per-class strategy list is now governed by v3.0.0 byAssetClass JSON from STRATEGY). Flag for Phase 16 cleanup register (#136 entry r): "PATTERN_POOL_STRATEGIES const + diagnostic endpoint — superseded by v3.0.0 byAssetClass; consolidate diagnostic into mapper-based response."
2. **`PATTERN_POOL_THRESHOLDS` — ALIVE but diagnostic-only.** Same disposition: Phase 16 register entry (s). 
3. **`PATTERN_POOL_GUARDRAILS` — ALIVE and load-bearing in SQE.** Today reads crypto-naming rows (`pattern_final_score_min` etc.) at crypto-scope. Per PATTERN-DETECT §2 obj 8, xstock_spot gets a parallel `XSTOCK_PATTERN_POOL_GUARDRAILS` (or per-class generic) reading from the renamed xstock rows. SQE consumer remains crypto-only; xstock SQE consumption is a CONFIDENCE-CHAIN / SCORING follow-on, NOT this batch.
4. **`DEFAULT_ASSET_CLASS = 'crypto_spot'`** — ALIVE. Today acts as crypto-by-default fallback in signal-orchestrator. After PATTERN-DETECT, consider whether this fallback is still correct. **Pre-audit decision: KEEP** — signal-orchestrator is the crypto signal path; falling back to crypto_spot is semantically right for that scope. Flag in Phase 16 register if cross-class orchestrator unification ever happens.
5. **`SourcePool` TYPE** — ALIVE. Consumer at `active-filter-pool.ts`. Type union is class-invariant (sourcePool values are crypto/xstock-shared semantics). **No change required** beyond the AssetClass type unification at §-3.

---

## §-3 Q-D disposition — `pattern-recognition.ts` preloader

### Read evidence

`server/core/pattern-recognition.ts` (66 lines, Directive 11.0E.1):
- `preloadPatternHistory(candleCount = 2000)`: `setTimeout(100)` no-op + `patternHistoryLoaded = true` + `warmupCandleCount = candleCount`. No actual pattern history is loaded — there is no I/O.
- `isPatternRecognitionWarmedUp()`: reads the flag.
- `getPatternHistoryStatus()`: dumps the flag + counter.
- `resetPatternHistory()`: clears.

### Consumer enumeration

| File | Consumer | Note |
|---|---|---|
| `server/core/boot_orchestrator.ts` | calls `preloadPatternHistory(2000)` at boot | Single production caller |
| `server/tests/unit/vts-modernization.test.ts` | asserts `isPatternRecognitionWarmedUp()` | Test only |

### Disposition

**Confirmed: STUB, functionally inert.** No actual pattern history is loaded — the `setTimeout(100)` is a placeholder that simulates a no-op load. The flag flips, the test passes, but nothing in production reads the flag for behavior (only the test asserts it). Threading `assetClass` through this stub adds per-class boilerplate for zero semantic benefit.

**Action: Phase 16 cleanup register (#136 entry t).** Per Langston Q-D Option (b). Document the stub + 1 caller + 1 test as removal target alongside other dead code. No PATTERN-DETECT touch.

---

## §-4 patternToTradeSignal disposition

### Consumer enumeration

| File | Line | Status |
|---|---|---|
| `server/services/pattern-recognizer.ts` | 538 | DEFINITION |
| `server/services/pattern-recognizer.ts` | 583, 588 | class-method wrapper (`PatternRecognizerService.patternToTradeSignal`) |
| `server/tests/unit/pattern-recognizer.test.ts` | 15, 188, 198, 221 | TEST only — 2 assertions of the trade-signal shape |

**Zero production consumers** outside the file itself.

### Disposition

**Confirmed: ORPHAN.** Three options:
- (A) Keep + add REQUIRED-`assetClass` for type consistency (PATTERN-DETECT §2 obj 3 stays)
- (B) Delete + delete corresponding test
- (C) Flag Phase 16 register

**CC recommendation: Option (A).** Cost is minimal (one parameter addition + 2 test updates) and forward-loads correctly if Phase 19 active-trading restoration ever consumes it. Aligns with STRATEGY's precedent (no orphans deleted mid-arc; orphans either threaded or registered). Decision deferred to Langston confirmation in §10 of this pre-audit.

---

## §-5 Per-component upstream/downstream/blast-radius enumeration

### §-5.1 `server/services/pattern-recognizer.ts` — primary surface

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | OHLC Cache (provides `Candle[]`); `getTimeframeWeight` + `applyTimeframeWeightedStrength` (TIMEFRAME_WEIGHTS table); `HYBRID_PARAMS` (system-guards) | Asset-class-invariant inputs. Candle data is OHLCV, no asset-class field today. |
| **Downstream (signal callers)** | `signal-orchestrator.ts:1355,1663,1684-1686` (crypto active trading + multi-timeframe cascade), `vts-runner.ts:941,3254,3316` (crypto VTS + pattern pool), `xstock_spot/eval-cycle.ts:408` (xstock VTS) | 5 production sites. Each call site already has the asset class known in its scope. |
| **Downstream (test callers)** | `pattern-recognizer.test.ts`, `multi-timeframe.test.ts`, `b79-0m-b2-lane-eligibility.test.ts` | 3 test files. Signature change requires test updates (mechanical). |
| **Shared state** | Singleton `PatternRecognizerService` instance via `getPatternRecognizer()` | Singleton holds no per-class state today; if instances ever go per-class, this singleton becomes a per-class map. |
| **Background execution** | None — pure function called per-signal-cycle | No cron, no timer, no async-poll. |
| **Blast radius** | **MEDIUM** — REQUIRED-parameter add propagates to 5 production sites + 3 test files. Compile-driven, no runtime change for byte-identical numeric behavior. | Same blast pattern as STRATEGY's `_SE_KEY` REQUIRED add. |

### §-5.2 `server/services/pattern-recognizer.ts::patternToTradeSignal` — orphan

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | None — pure function | Crypto-tuned ATR multipliers (1.5× / 2.5×) hardcoded |
| **Downstream** | ZERO production callers; 2 test assertions | Orphan confirmed |
| **Blast radius** | **LOW** — only test updates required |

### §-5.3 `server/asset_classes/crypto_spot/pattern-pool-filters.ts` — file rewrite

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | `getCachedNumberRequired` from `module-constants-service`; B72 prefetch via `b72-warmup.ts:46` `prefetchModule('pattern_pool_gates')` | Cache populated at boot |
| **Downstream** | `signal_quality_evaluator.ts:28, 249` (PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR — live SQE consumer); `signal-orchestrator.ts:98` (unused import); `routes.ts:12635` (diagnostic); `active-filter-pool.ts:24` (SourcePool + AssetClass types) | 4 importers, 1 live + 3 unused/diagnostic |
| **Shared state** | The PATTERN_POOL_GUARDRAILS getters read from cache each call (60s TTL per module-constants-service) | No stale risk if cache refreshes |
| **Blast radius** | **MEDIUM** for AssetClass type change (active-filter-pool consumes); **LOW** for PATTERN_POOL_GUARDRAILS getter (semantic-preserving rename internal) | Type unification ripples to active-filter-pool — verify post-change tsc still clean |

### §-5.4 `server/asset_classes/xstock_spot/pattern-pool-filters.ts` — file rewrite

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | After rewrite: `getCachedNumberRequired` + B72 prefetch (same as crypto path) | Pre-rewrite: no DB reads (TS literals only) |
| **Downstream** | Today: ZERO production consumers of the literals (only comment refs in pattern-filter.ts + eval-cycle.ts); JSDoc shim exports for back-compat. After PATTERN-DETECT: still zero direct consumers (no xstock SQE writer in PATTERN-DETECT; that's CONFIDENCE-CHAIN / SCORING follow-on). | Rewrite is forward-load-only |
| **Shared state** | None (today); after rewrite: cache-read getter pattern | No state risk |
| **Blast radius** | **LOW** — pre-batch consumers are 0, post-batch direct readers are 0 (preparation for future xstock SQE wire-in) | Cleanest possible rewrite |

### §-5.5 `module_constants.pattern_pool_gates` DB rows (rename + seed)

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | `prefetchModule('pattern_pool_gates')` at boot — reads ALL rows for the module into cache | Cache-warm at boot per b72-warmup |
| **Downstream** | crypto_spot rows → `crypto_spot/pattern-pool-filters.ts` getters → `signal_quality_evaluator.ts` (live). xstock_spot rows (renamed + seeded) → no current consumers (forward-load). | Crypto byte-identical post-rename (rows unchanged for crypto); xstock semantic-preserved (only key names change). |
| **Shared state** | module-constants-service cache (60s TTL) | Cache invalidates on `setConstant` write; migration triggers reload on first read |
| **Blast radius** | **LOW** — migration is rename + insert; no live DB consumer breaks. b72-warmup `prefetchModule` returns N rows where N stays the same (rename) and increases by 2 (seed). Boot still passes the `rowCount > 0` fail-hard gate. | Idempotent ON CONFLICT discipline same as STRATEGY |

### §-5.6 `server/core/pattern-recognition.ts` (preloader stub)

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | None (no I/O) | setTimeout no-op |
| **Downstream** | `boot_orchestrator.ts` (1 call); `vts-modernization.test.ts` (1 assertion) | Stub remains stub |
| **Blast radius** | **NONE** for PATTERN-DETECT (Phase 16 deferral); **LOW** if eventually deleted | Inert |

### §-5.7 `server/config/canonical-regime-strategy-map.ts::selectContextAwareStrategy`

| Direction | Components | Notes |
|---|---|---|
| **Upstream** | `CANONICAL_REGIME_STRATEGY_MAP` (regime → strategy mapping), `normalizePatternToCanonical` (pattern hint normalization) | Both class-invariant today |
| **Downstream** | `vts-runner.ts:967` (live crypto VTS), `diagnostic-11.4G.ts` (dev tool) | 1 live caller |
| **Shared state** | None (pure function) | Stateless |
| **Blast radius** | **LOW** — REQUIRED-`assetClass` add ripples to 2 callers (vts-runner + diagnostic), both have crypto context in scope | Same shape as STRATEGY's mapper REQUIRED-`assetClass` ripples |

---

## §-6 SIM consultation result — components NOT modified by this batch but worth flagging

Per Step 1.a architectural read, SIM mentions these pattern-adjacent components — confirming they're OUT of scope:

| Component | SIM line | Why OUT |
|---|---|---|
| FX5 Scanner pattern-pool routing | §704, §11069-11185 | Already DB-driven post-Batch 19G + B78. Filter values resolve via screener_filters, not the pattern-pool-filters const exports. |
| Active Filter Pool (`addPatternPoolSurvivors`) | §180-190 | Class-aware via SourcePool type. AssetClass type unification at §-3 forward-loads correctly. |
| Paper Position Sizing (15% cap from PATTERN_POOL_GUARDRAILS) | §388-389 | Reads via signal metadata sourcePool === 'pattern' check. Crypto-only consumer today. xstock paper sizing handled in EXECUTION batch (#15). |
| Multi-Timeframe Cascade (Directive 10.7) | (in pattern-recognizer.ts) | Class-invariant pattern math — TIMEFRAME_WEIGHTS table is universal. Out of scope. |
| pattern-filter-profile.ts (legacy at `config/`) | (legacy path) | Still exists as re-export shim per SIM §88 — B78 relocated to `crypto_spot/`. Phase 16 cleanup target. |

---

## §-7 PATTERN_TO_CANONICAL map + normalizePatternToCanonical — F-1 invariance confirmation

`PATTERN_TO_CANONICAL` map at `canonical-regime-strategy-map.ts:602-614`:

```
PINBAR → PINBAR
ENGULFING → ENGULFING
MORNING_STAR → MORNING_STAR
ABCD → ABCD
TRI_STAR → TRI_STAR
INSIDE_BAR → INSIDE_BAR
THREE_SOLDIERS → MORNING_STAR (bullish continuation family)
EVENING_STAR → MORNING_STAR
DOJI → TRI_STAR
HAMMER → PINBAR
SHOOTING_STAR → PINBAR
```

**Pattern name mapping is CLASS-INVARIANT BY CONSTRUCTION.** A PINBAR is a PINBAR regardless of whether the chart shows BTC/USD or AAPLx/USD. The map is universal taxonomy. **F-1 lever audit: PASS.** No per-class scoping required for this map or for `normalizePatternToCanonical`.

---

## §-8 ATR multiplier hardcoded crypto-tune (SIM §11263)

`patternToTradeSignal` line 553-554:
```
const stopDistance = atr > 0 ? atr * 1.5 : currentPrice * 0.01;
const targetDistance = atr > 0 ? atr * 2.5 : currentPrice * 0.02;
```

**Crypto-tuned** per SIM §11263: "may need different for equity microstructure." Per scope §3 OUT OF SCOPE: numeric tuning deferred to Layer-3 batch. **PATTERN-DETECT plumbs `assetClass: AssetClass` into `patternToTradeSignal` but leaves the multipliers at 1.5× / 2.5× for both crypto and xstock.** Future Layer-3 batch can introduce per-class lookups via `getCachedNumberRequired('pattern_pool_gates', 'atr_stop_multiplier', _PATTERN_KEY)` etc. with `_PATTERN_KEY` scoped per asset class.

---

## §-9 Threshold migration to module_constants (Q-A — Langston DEFERRED)

Per Langston Step 1 ACK Q-A: **DEFER.** The 11 hardcoded detect-function thresholds (PINBAR wick 1.5×, INSIDE_BAR 0.001 tolerance, THREE_SOLDIERS 0.0025, MORNING_STAR 0.3, ABCD 0.350-0.820 + min candles 12) stay inline literals for both crypto and xstock. PATTERN-DETECT plumbs `assetClass` parameter into the 6 detect functions but does NOT branch on it. Future Layer-3 batch (post-xStock shadow-mode evidence) can migrate.

**No Q-H scope expansion triggered.** PATTERN-DETECT stays "modest" per umbrella v4 §1.5.

---

## §-10 Open decisions for Langston (Step 2 → Step 3 gate)

| ID | Question | CC recommendation | Action if Langston disagrees |
|---|---|---|---|
| **R-1** | `patternToTradeSignal` disposition: (A) thread REQUIRED-`assetClass`, (B) delete + remove test, (C) Phase 16 register | **(A) thread** — minimal cost, forward-loads correctly for Phase 19 restoration. | If (B): delete file region + 2 tests + flag in completion report. If (C): no parameter add, no test update, RUNNING_ISSUES #136 entry. |
| **R-2** | `selectContextAwareStrategy` body update: (A) just add REQUIRED-`assetClass` (no behavior change — body stays on CANONICAL_REGIME_STRATEGY_MAP[regime]), OR (B) refactor body to route through v3.0.0 `getFavoredStrategiesForRegime(regime, assetClass)` | **(A) plumbing-only this batch** — body refactor risks crypto behavior change. Body refactor is a SCORING / ORCHESTRATOR concern. | If (B): scope expands +1 refactor + +1 unit test for body change; Langston re-reviews. |
| **R-3** | `PATTERN_POOL_GUARDRAILS` xstock-side mirror in `xstock_spot/pattern-pool-filters.ts`: (A) parallel `XSTOCK_PATTERN_POOL_GUARDRAILS` with class-narrow getters, OR (B) generic `getPatternPoolGuardrails(assetClass)` function shared from a new utility | **(A) parallel const export** — matches crypto-side pattern symmetry. Cleaner imports for downstream xstock SQE consumer (CONFIDENCE-CHAIN / SCORING work). | If (B): create new util + delete crypto's const exports + migrate signal_quality_evaluator.ts consumer (scope creep into SQE — flag Kyle). |
| **R-4** | `PATTERN_POOL_STRATEGIES` + `PATTERN_POOL_THRESHOLDS` (mostly-dead consts): (A) leave alive + Phase 16 register, (B) delete now + clean diagnostic endpoint, (C) leave alive + skip register | **(A) Phase 16 register** — clean closure-discipline; orphan removal is a deliberate cleanup batch, not a mid-arc rip. | If (B): scope expands +1 routes.ts edit + diagnostic-endpoint consumer audit. |
| **R-5** | DB migration ordering: (A) single migration file (rename + seed) OR (B) two files (rename, then seed) ordered in MANIFEST.txt | **(A) single file, BEGIN/COMMIT-wrapped, idempotent ON CONFLICT** — STRATEGY's pattern. | If (B): no real downside; just more files. |
| **R-6** | Test coverage gap: `patternToTradeSignal` orphan currently has 2 tests asserting trade-signal shape on PINBAR + MORNING_STAR. After Langston R-1 decision, do those tests get the assetClass parameter or get deleted? | **Mirror R-1 decision.** | n/a |
| **R-7** | Q-G ATR multiplier per-class — should `patternToTradeSignal` parameter accept `assetClass` even though the body doesn't branch? | **YES** — type discipline matches detect functions. Plumbing parameter even with no body branch is the convention. | n/a |

---

## §-11 Pre-implementation chunking proposal (Step 3 plan)

Following STRATEGY's chunked-commit pattern for Step 4 reviewability:

| Chunk | Files | Scope |
|---|---|---|
| **A — Migration SQL** | `drizzle/migrations/2026-05-24-b79-0n-pattern-detect-naming-converge.sql` (NEW) + `MANIFEST.txt` (append) | Rename xstock rows + seed pattern_rsi_min/max (single file) |
| **B — Pattern recognizer signatures** | `server/services/pattern-recognizer.ts` (REQUIRED-assetClass on scanPatterns + 6 detect + patternToTradeSignal + class methods) | Compile-driven |
| **C — Caller threading** | `signal-orchestrator.ts` (4 sites), `vts-runner.ts` (3 sites), `xstock_spot/eval-cycle.ts` (1 site), `diagnostic-11.4G.ts` | All callers thread call-site asset class |
| **D — Pattern-pool-filters file rewrites** | `crypto_spot/pattern-pool-filters.ts` (AssetClass type unification + line 76 fix) + `xstock_spot/pattern-pool-filters.ts` (getter shape rewrite + deprecated shim exports) | Mirror crypto-side pattern |
| **E — selectContextAwareStrategy REQUIRED-assetClass** | `canonical-regime-strategy-map.ts:637` + `vts-runner.ts:967` + `diagnostic-11.4G.ts` | Per R-2 (A) decision |
| **F — Unit tests** | 4 new files at `server/tests/unit/b79-0n-pattern-detect-*.test.ts` + 3 existing test files updated (signature ripple) | TypeScript REQUIRED-assetClass type-locks + DB-shape regression-lock + F-1 invariance + crypto byte-identity |
| **G — Local verify before push** | `npx tsc --noEmit` → 494 (no regression) + `npx vitest run server/tests/unit/b79-0n-pattern-detect-*` (4 pass) + `npx vitest run server/tests/unit/pattern-recognizer.test.ts` (regression-lock) | Mirror clone gate |

**Anti-graveyard discipline (STRATEGY precedent):** zero new `as any` / `@ts-expect-error` (outside the dedicated type-lock test file) / `@ts-ignore` / `!`. Baseline regenerate ONLY if PATTERN-DETECT's threading legitimately shifts pre-existing error line numbers (delta breakdown documented in completion report).

---

## §-12 Numeric deltas (CLAUDE.md §9.2 mandatory)

| Item | Scope v1 stated | Pre-audit refined |
|---|---|---|
| `scanPatterns` production caller sites | 5 production + 3 test + 1 diagnostic | UNCHANGED (5 + 3 + 1) |
| `selectContextAwareStrategy` caller sites | "pre-audit confirms alive/dead" | **ALIVE: 1 production (vts-runner) + 1 diagnostic** |
| `PATTERN_POOL_STRATEGIES` consumer status | "pre-audit confirms" | **MOSTLY DEAD: 1 unused import + 1 diagnostic endpoint** |
| `PATTERN_POOL_THRESHOLDS` consumer status | (not in scope v1) | **MOSTLY DEAD: 1 diagnostic endpoint** |
| `PATTERN_POOL_GUARDRAILS` consumer status | (not in scope v1) | **ALIVE: 1 production (SQE) + 1 diagnostic + 1 unused import** |
| `patternToTradeSignal` orphan status | "TBD" | **ORPHAN: zero production callers, 2 test assertions** |
| Phase 16 register additions | 0-3 | **4 entries: PATTERN_POOL_STRATEGIES (r), PATTERN_POOL_THRESHOLDS (s), preloader stub (t), legacy `XSTOCK_SPOT_*` literal const exports (u — deprecated shim)** |
| Pre-audit chunked-commit plan | (not in scope v1) | **7 chunks A-G** |
| New seed rows | net +2 (pattern_rsi_min + pattern_rsi_max) | UNCHANGED |
| Renamed xstock_spot rows | 2 (final_score_floor → pattern_final_score_min; max_position_pct → pattern_max_position_pct) | UNCHANGED |
| New unit test files | 4 | UNCHANGED |
| Existing test files updated for signature ripple | 3 (pattern-recognizer.test.ts + multi-timeframe.test.ts + b79-0m-b2-lane-eligibility.test.ts) | **+1 vts-modernization.test.ts only if Q-D Option (b) is overridden** (Langston has confirmed (b) — no update needed) |

---

## §-13 Ready-for-dispatch checklist

- [x] §-0 Q-B grep cross-check complete — ZERO production consumers of legacy xstock row names
- [x] §-1 Q-E disposition confirmed — `selectContextAwareStrategy` ALIVE in vts-runner (crypto path)
- [x] §-2 Q-F disposition confirmed — `PATTERN_POOL_STRATEGIES` + `PATTERN_POOL_THRESHOLDS` mostly-dead, `PATTERN_POOL_GUARDRAILS` alive
- [x] §-3 Q-D disposition confirmed — preloader is stub, Phase 16 register target
- [x] §-4 patternToTradeSignal orphan confirmed
- [x] §-5 per-component upstream/downstream/blast-radius enumeration (7 components)
- [x] §-6 SIM consultation result + 5 OUT-of-scope components flagged
- [x] §-7 F-1 lever audit for PATTERN_TO_CANONICAL map (PASS)
- [x] §-8 ATR multiplier crypto-tune flagged for Layer-3
- [x] §-9 Q-A threshold migration deferral confirmed
- [x] §-10 7 open decisions (R-1 through R-7) for Langston Step 2 ACK
- [x] §-11 Step 3 chunked-commit plan (A-G)
- [x] §-12 numeric deltas refined (CLAUDE.md §9.2)
- [ ] Dispatch to Langston via file-first protocol
- [ ] Telegram one-paragraph Step 2 close summary

---

*End of B79.0n.PATTERN-DETECT pre-audit v1. Iteration to v2 only if Langston returns R-1 through R-7 decisions that change scope material.*
