# B79.0n.STORAGE — Step 2 pre-audit

> **Parent scope:** `B79_0n_STORAGE_SCOPE.md` (Step 1 Langston ACK 2026-05-21 PM with 3 concerns A/B/C to bake in here).
> **Position:** sub-batch 3 of 18 in B79.0n umbrella v3.
> **Pre-audit conducted:** 2026-05-21 PM against `migration/aws-supabase` HEAD `d912ba0d5`.
> **Verdict:** ready for Step 3 implementation. All 3 Langston concerns resolved + full caller enumeration done + 1 in-passing finding logged.

---

## §0 — Resolution of Langston Concerns A / B / C

### Concern A — `loadSqeConfig` (now `getSQEThresholdsFromConfig`) caller chain enumeration

**RESOLVED.** Caller chain traced end-to-end:

```
External callers (3 sites):
  ├─ server/services/signal-orchestrator.ts:581 → signalQualityEvaluator.evaluate(sqeInput)
  │     └─ rawSignal has .assetClass via signal-orchestrator scope (already-asset-class-aware code path)
  │
  ├─ server/core/rtb/ready_to_buy_service.ts:658  → signalQualityEvaluator.evaluate(sqeInput)
  │     └─ signal has .assetClass via RTB queue row (already on schema; RTB is per-class today)
  │
  └─ server/core/rtb/ready_to_buy_service.ts:876  → signalQualityEvaluator.evaluate(sqeInput)
        └─ same as 658 — RTB row .assetClass available

(server/services/paper-execution-engine.ts also imports SQE but does NOT call evaluate;
 verified via grep — it imports the module for type signatures only.)

Internal call sites (inside signal_quality_evaluator.ts):
  ├─ line 237 (in evaluateSignalQuality) → getSQEThresholdsFromConfig(input.mode)
  │     ↑ becomes input.mode + input.assetClass
  │
  ├─ line 519 (in SignalQualityEvaluatorService.getThresholds) → getSQEThresholdsFromConfig(mode)
  │     ↑ getThresholds gains assetClass param; threading from caller
  │
  ├─ line 440 → evaluateSignalQuality(input)   [in BatchEvaluator]
  │     ↑ input already typed SQEInput (gets new assetClass field)
  │
  └─ line 525 → evaluateSignalQuality(input, options)   [in SignalQualityEvaluatorService.evaluate]
        ↑ same — input has assetClass

Diagnostic-only callers (NOT runtime decision path):
  └─ server/scripts/diagnostic-11.4G-5.ts:82-83 → getSQEThresholdsFromConfig('paper'|'live')
        ↑ category (d) — hardcode assetClass: 'crypto_spot' with inline "diagnostic baseline" comment
```

**Plumb-through plan:**

1. Add `assetClass: AssetClass` to `SQEInput` interface at `signal_quality_evaluator.ts:72-88`.
2. Both `evaluateSignalQuality` and `evaluateSignalQualitySync` accept the field via input.
3. `getSQEThresholdsFromConfig` signature gains required `assetClass: AssetClass` param.
4. `SignalQualityEvaluatorService.getThresholds` gains required `assetClass: AssetClass` param (cache key extended from `mode` → `${mode}:${assetClass}`).
5. All 3 external sqeInput construction sites populate `assetClass` from their existing scope.
6. Diagnostic script gets explicit hardcoded `'crypto_spot'` with "canonical baseline" comment.

All caller contexts have `assetClass` available at compile time. No caller-refactoring needed beyond field addition. **No discovery-at-implementation risk.**

### Concern B — `getSQEModuleDefaults()` scope decision

**RESOLVED — DEFER to SCORING (sub-batch 8).** Decision rationale documented inline:

`getSQEModuleDefaults()` at line 53 uses `_SQE_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }` (wildcard scope). The seeded `module_constants.sqe_config` rows exist ONLY at wildcard scope today. Verified via:

```sql
SELECT module_name, key, asset_class, value FROM module_constants
WHERE module_name = 'sqe_config' ORDER BY asset_class, key;
-- Returns 2 rows: (sqe_config, min_final_score, *) + (sqe_config, min_regime_weight, *)
```

**This batch's scope:** screener_filters (Layer 1, primary source) becomes per-asset-class. module_constants fallback (Layer 2, secondary defaults) stays wildcard.

**Acceptance of half-routed risk:** the asymmetry is acceptable for this batch because:
- Layer 1 (screener_filters) is the dominant source — runtime almost always reads from there
- Layer 2 (module_constants) is the fallback when screener_filters has no row OR a missing field; with per-class rows seeded by §2.5 (this pre-audit), the fallback path is rarely hit
- Layer 3 (SQE_DEFAULT_THRESHOLDS static const) is the catastrophic fallback only

**Deferred to SCORING:** if/when per-class `sqe_config.crypto_spot.min_final_score` vs `sqe_config.xstock_spot.min_final_score` rows become operationally needed (different thresholds per class), SCORING batch adds:
- Migration: insert per-class rows alongside existing wildcards
- `_SQE_GK` becomes parameterized by `assetClass`
- `getSQEModuleDefaults(assetClass)` signature gains required param

**RUNNING_ISSUES entry filed** at governance close with explicit trigger condition per Langston Step 2 ACK Q-S2-4:

> "B79.0n.STORAGE deferred per-class `module_constants.sqe_config` rows to SCORING batch. Current state: screener_filters is per-class (this batch); module_constants is wildcard. Asymmetry acceptable because screener_filters is Layer 1 primary source; module_constants is Layer 2 fallback hit only when filters has no row or missing field. **Promote to active work when:** (a) xStock requires different `min_final_score` / `min_regime_weight` than crypto (will surface during Phase 19 active-trade calibration), OR (b) any third asset class onboards (3-class asymmetry compounds harder than 2-class), OR (c) SCORING batch begins regardless. **Promotion to active = `_SQE_GK` becomes parameterized by assetClass + `getSQEModuleDefaults(assetClass)` signature gains required param.**"

### Concern C — tsconfig strictness baseline

**RESOLVED — `strict: true` confirmed.**

Verified at `tsconfig.json` line 11: `"strict": true`. Implies `strictNullChecks: true` + `noImplicitAny: true` + `strictFunctionTypes: true` + `strictBindCallApply: true` + `strictPropertyInitialization: true` + `alwaysStrict: true`.

The `@ts-expect-error` regression test at §4.1 will fire as expected. Missing required parameter → compile error → test asserts the error. Lock is real, not paper-tiger.

**Sub-finding:** `tsconfig.json` does NOT enable `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes` (newer flags that catch additional related issues). Out of scope for this batch — flag for future TypeScript hardening sweep if needed.

---

## §1 — Full call-site enumeration (Step 4.5 writer-side audit)

Pre-audit grep: `storage\.getScreenerFilters` returns **38 call sites** in server/ (6 already-correct xStock-explicit + 32 silent-fallback). Earlier draft said "30" — corrected per Langston Step 2 ACK item 2. Plus the broader `\bassetClass\?:` + destructure-default grep returned no additional anti-pattern instances in production code.

### §1.1 — Already-correct (xStock-explicit; no change needed; regression-verify only)

| # | File:line | Pattern |
|---|-----------|---------|
| 1 | `server/asset_classes/xstock_spot/pattern-filter.ts:142` | `assetClass: 'xstock_spot'` |
| 2 | `server/asset_classes/xstock_spot/imf-evaluator.ts:118` | `assetClass: 'xstock_spot'` |
| 3 | `server/asset_classes/xstock_spot/global-filter.ts:86` | `assetClass: 'xstock_spot'` |
| 4 | `server/asset_classes/xstock_spot/eval-cycle.ts:105` | `assetClass: 'xstock_spot', filterPath: 'active_quant'` |
| 5 | `server/asset_classes/xstock_spot/eval-cycle.ts:107` | `assetClass: 'xstock_spot', filterPath: <pattern>` |
| 6 | `server/asset_classes/xstock_spot/eval-cycle.ts:110` | `assetClass: 'xstock_spot', filterPath: <family>` |

### §1.2 — Silent-fallback sites — categorized per scope §2.2

**Category (a) — ASSET-CLASS-INTENTIONAL CRYPTO** (caller IS a crypto-scoped code path; update to pass explicit `'crypto_spot'`)

| # | File:line | Reasoning |
|---|-----------|-----------|
| 1 | `server/services/fx5-scanner.ts:688` | FX5 is the crypto scanner (`fx5-scanner.ts`); all 6 sites here are intentional crypto |
| 2 | `server/services/fx5-scanner.ts:737` | |
| 3 | `server/services/fx5-scanner.ts:746` | |
| 4 | `server/services/fx5-scanner.ts:769` | |
| 5 | `server/services/fx5-scanner.ts:801` | |
| 6 | `server/services/fx5-scanner.ts:822` | |
| 7 | `server/services/config-update-service.ts:208` | Updates the crypto baseline config via UI; pre-multi-asset-aware UI is crypto-scoped |

**Category (b) — ASSET-CLASS-INTENTIONAL XSTOCK** (already covered in §1.1; no new sites)

**Category (c) — ASSET-CLASS-AWARE-NEEDS-ROUTING** (caller's assetClass is determined by signal/cycle context; plumb through)

| # | File:line | Reasoning |
|---|-----------|-----------|
| 1 | `server/core/filters/signal_quality_evaluator.ts:143` | **THE PRODUCTION BUG** — `getSQEThresholdsFromConfig` is called per-signal; the signal's asset class must determine which thresholds are read. Plumbed via the SQEInput.assetClass field addition (Concern A resolution). |

**Category (d) — ASSET-CLASS-AGNOSTIC DIAGNOSTIC** (caller intentionally wants the canonical crypto baseline for UI display; per Langston Q2 ACK use a dedicated helper)

| # | File:line | Endpoint | Reasoning |
|---|-----------|----------|-----------|
| 1 | `server/index.ts:993` | Boot-time loader | Boot diagnostic; reads canonical crypto baseline |
| 2 | `server/index.ts:1074` | Boot-time loader | Same |
| 3 | `server/routes.ts:2199` | Config-CRUD GET | UI showing canonical crypto thresholds |
| 4 | `server/routes.ts:2361` | Config-CRUD PUT | UI editing canonical crypto thresholds |
| 5 | `server/routes.ts:2536` | Settings UI | Same |
| 6 | `server/routes.ts:3389` | Settings UI | Same |
| 7 | `server/routes.ts:3510` | Settings UI | Same |
| 8 | `server/routes.ts:12499` | Settings UI | Same |
| 9 | `server/routes.ts:13858` | Settings UI | Same |
| 10 | `server/routes.ts:20817` | Settings UI | Same |
| 11 | `server/routes/vts.ts:1445` | Crypto filter-diagnostics UI panel | All 13 sites here serve the crypto Filter Diagnostics tab |
| 12 | `server/routes/vts.ts:1446` | | |
| 13 | `server/routes/vts.ts:1447` | | |
| 14 | `server/routes/vts.ts:1448` | | |
| 15 | `server/routes/vts.ts:1450` | | |
| 16 | `server/routes/vts.ts:1451` | | |
| 17 | `server/routes/vts.ts:1452` | | |
| 18 | `server/routes/vts.ts:1453` | | |
| 19 | `server/routes/vts.ts:1454` | | |
| 20 | `server/routes/vts.ts:1455` | | |
| 21 | `server/routes/vts.ts:1456` | | |
| 22 | `server/routes/vts.ts:1457` | | |
| 23 | `server/scripts/diagnostic-11.4G-5.ts:82-83` | Diagnostic script | Standalone diagnostic CLI tool |

**Counts (corrected per Langston Step 2 ACK item 2):** 6 already-correct + 7 (a) + 1 (c) + 24 (d) = **38 sites total**, of which **32 are silent-fallback sites to update**. The (d) count is 24 because the diagnostic script at `scripts/diagnostic-11.4G-5.ts:82-83` contains TWO call sites (lines 82 + 83) collapsed into one table row above. (d) = 2 (index.ts) + 8 (routes.ts) + 12 (routes/vts.ts) + 2 (diagnostic-script) = 24. Total silent-fallback CALLS = 7 + 1 + 24 = 32.

### §1.3 — Implementation pattern per category

- **(a)** — explicit `assetClass: 'crypto_spot'` literal at the call site. No type-system change beyond the storage-signature update.
- **(c)** — `assetClass` threaded via SQEInput field (Concern A plumb-through).
- **(d)** — per Langston Q2 ACK preference: introduce `storage.getCanonicalScreenerConfig({ mode, filterPath? })` helper that internally hardcodes `'crypto_spot'` + has a docstring "canonical baseline for display; not for asset-class-aware routing." The 23 (d) sites convert to call the helper. Cleaner than 23× hardcoded `'crypto_spot'` + comments; semantically distinguishes "I want canonical crypto" from "I want crypto for this cycle."

---

## §2 — Storage API broader anti-pattern audit (Concern §2.5 / Langston Q3 add)

Grep across `server/` for `\bassetClass\?:` (optional parameter shape) AND `assetClass\s*=\s*['"]crypto_spot['"]` (destructure-default shape):

**Optional-parameter shape findings:**
- `server/storage.ts:235,950` — `getScreenerFilters` (THE TARGET — being fixed this batch)
- `server/core/rtb/ready_to_buy_service.ts:110` — `assetClass?: string` on RTB row type. This is a SCHEMA shape, not a function signature. Different concern; out of scope.
- `server/services/active-filter-pool.ts:40` — comment-only "future-proofing" mention
- `server/services/vts-runner.ts:829, 2114` — `assetClass?: string` on internal helper functions. Different concern (VTS runtime); flag for STRATEGY batch (sub-batch 5)
- `server/services/vts-service.ts:767` — same pattern; STRATEGY scope
- `server/services/exit-strategy-replay-service.ts:37,47` — comments documenting PRIOR pre-B82 anti-pattern; current code is asset-class-explicit (B82 cleanup landed)

**Destructure-default shape:** zero production code matches. All grep hits are documentation comments referencing `assetClass='xstock_spot'` examples, NOT runtime defaults.

**Decision:** this batch fixes the storage.ts (load-bearing primary case) only. The vts-runner / vts-service findings are flagged for STRATEGY batch's pre-audit to absorb. Not in scope here.

---

## §3 — `screener_filters` row-coverage audit (scope §2.5)

Pre-audit psql query: `SELECT mode, asset_class, filter_path FROM screener_filters ORDER BY asset_class, mode, filter_path`.

Expected combinations per scope §2.5.b (4 family-IMF paths) + §2.5.c (active/vts × quant/pattern):

**Per-mode, per-class required combinations:**
```
filter_paths needed:
  active_quant, active_pattern, vts_quant, vts_pattern,
  active_trend, active_reversal, active_breakout, active_oscillator,
  vts_trend, vts_reversal, vts_breakout, vts_oscillator
  (12 distinct filter_paths)

modes: paper, live
classes: crypto_spot, xstock_spot
```

Expected total: 12 × 2 × 2 = **48 rows minimum.**

**Live check ran 2026-05-21 PM per Langston Step 2 ACK Q-S2-5 ask** (against `migration/aws-supabase` HEAD `d912ba0d5`, deploy commit `c97ceec81`):

```sql
SELECT asset_class, mode, COUNT(*) FROM screener_filters WHERE filter_path IN (...) GROUP BY asset_class, mode;
```

| asset_class | mode  | rows present | rows missing |
|-------------|-------|------:|------:|
| crypto_spot | live  | 12 / 12 ✓ | 0 |
| crypto_spot | paper | 12 / 12 ✓ | 0 |
| xstock_spot | live  | 7 / 12 | **5** |
| xstock_spot | paper | 7 / 12 | **5** |

**Total missing: 10 rows.** Asymmetric coverage across modes (likely B79.0m.b2 seeding artifact):

- **xstock_spot/live MISSING:** `vts_quant`, `vts_trend`, `vts_reversal`, `vts_breakout`, `vts_oscillator` (the family-IMF + quant VTS paths)
- **xstock_spot/paper MISSING:** `active_breakout`, `active_oscillator`, `active_reversal`, `active_trend`, `vts_quant` (the family-IMF active paths + VTS quant)
- xstock_spot already has: `active_quant`, `active_pattern`, `vts_pattern` in both modes + scattered family paths

**Seed migration is a real deliverable** (not "maybe"). Migration shape:

```sql
-- 10 rows cloned from crypto_spot baseline; placeholder values per Langston Q4 ACK.
INSERT INTO screener_filters (mode, asset_class, filter_path, <all-cols>)
SELECT s.mode, 'xstock_spot' AS asset_class, s.filter_path, <all-cols from s>
FROM screener_filters s
WHERE s.asset_class = 'crypto_spot'
  AND (
    (s.mode = 'live'  AND s.filter_path IN ('vts_quant','vts_trend','vts_reversal','vts_breakout','vts_oscillator')) OR
    (s.mode = 'paper' AND s.filter_path IN ('active_breakout','active_oscillator','active_reversal','active_trend','vts_quant'))
  )
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;
```

Migration file path: `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql`. Idempotent via ON CONFLICT.

**Placeholder-cloned values per Langston Q4 ACK:** crypto's current thresholds become xStock's initial seed. RUNNING_ISSUES entry filed at governance close with explicit trigger condition (Q-S2-4 below): "B79.0n.STORAGE xstock_spot screener_filters rows are placeholder-cloned from crypto baseline. **Promote to active Layer 3 calibration when:** (a) xStock active-trading enablement gate approaches (Phase 19), OR (b) any Step 7 verification shows xStock signal generation rate materially different from crypto suggesting per-class thresholds needed."

---

## §4 — Step 4.7 — Scan-cycle read-side data-completeness audit

For each (c) ASSET-CLASS-AWARE-NEEDS-ROUTING call site, confirm the calling context's `assetClass` is available at compile time:

| Site | Calling context | assetClass source |
|------|-----------------|-------------------|
| `signal_quality_evaluator.ts:143` | Called from `signalQualityEvaluator.evaluate(sqeInput)` in 3 places (orchestrator, RTB ×2) | NEW field `SQEInput.assetClass` populated by each caller from their scope |

All 3 SQEInput-construction sites verified:
- `signal-orchestrator.ts:567` — has `rawSignal.assetClass` available (signal-orchestrator is per-signal and signals carry asset class)
- `ready_to_buy_service.ts:646` — has `signal.assetClass` from the RTB queue row (already on schema)
- `ready_to_buy_service.ts:864` — same

Internal `evaluateSignalQuality` calls at lines 440, 525 receive `input` (typed `SQEInput`); the new field flows through.

**No calling context refactoring needed beyond field addition.** Implementation path is clean.

---

## §5 — In-passing findings (umbrella §2.5)

### §5.1 — In-passing finding (absorb into this batch)

**Finding:** `server/scripts/diagnostic-11.4G-5.ts:82-83` calls `getSQEThresholdsFromConfig` with hardcoded `'paper'` / `'live'` mode but no asset class. Today silently reads crypto thresholds (correct behavior — script is a diagnostic baseline). Post-fix, the script will need to pass `assetClass` explicitly. **Absorb into this batch's caller update sweep** — single-line touch.

### §5.2 — In-passing findings (deferred — too large to bundle)

| Finding | File:line | Reason for defer |
|---------|-----------|-------------------|
| `RtbSignal.assetClass?: string` — RTB row type allows undefined asset_class | `server/core/rtb/ready_to_buy_service.ts:110` | Schema-level shape, not call-site; needs migration + downstream null-handling sweep; RTB batch scope (#11) |
| `vts-runner.ts` internal helpers with `assetClass?: string` | `server/services/vts-runner.ts:829, 2114` | VTS runtime concerns; STRATEGY batch scope (#5) |
| `vts-service.ts:767` `assetClass?: string` | `server/services/vts-service.ts:767` | Same; STRATEGY scope |

---

## §6 — `getSQEModuleDefaults()` cache-key extension (Concern B follow-on)

When `SignalQualityEvaluatorService.getThresholds` gains `assetClass` param (§0 Concern A item 4), the in-memory cache key extends:

**Before:**
```ts
private cachedThresholds: Map<string, ...> = new Map();
// cache.set(mode, ...)  // key = 'paper' or 'live'
```

**After:**
```ts
private cachedThresholds: Map<string, ...> = new Map();
// cache.set(`${mode}:${assetClass}`, ...)  // key = 'paper:crypto_spot', 'live:xstock_spot', etc.
```

Per-asset-class cache eviction policy: 60-second TTL unchanged. Per-class cache means 4 cache entries instead of 2 (2 modes × 2 classes); memory impact trivial.

---

## §7 — Final implementation plan (confirms scope §3)

1. Add `AssetClass` import to `server/storage.ts`.
2. Change `getScreenerFilters` signature: `assetClass?: string` → `assetClass: AssetClass`. Remove `'crypto_spot'` default at line 952.
3. Update internal `upsertScreenerFilters` caller at line 967 to pass `assetClass`.
4. Add `getCanonicalScreenerConfig` helper per Langston Q2 (5 lines; hardcodes `'crypto_spot'` with docstring).
5. Add `assetClass: AssetClass` field to `SQEInput` interface.
6. Plumb `assetClass` through `getSQEThresholdsFromConfig`, `evaluateSignalQuality`, `evaluateSignalQualitySync`, `SignalQualityEvaluatorService.getThresholds` + `.evaluate`.
7. Update 3 SQEInput-construction sites to populate `assetClass`.
8. Update 7 (a) sites to pass `assetClass: 'crypto_spot'`.
9. Update 23 (d) sites to call `storage.getCanonicalScreenerConfig`.
10. Update 1 diagnostic script (scripts/diagnostic-11.4G-5.ts) to pass explicit asset class.
11. Pre-flight psql: verify `screener_filters` row coverage; ship seed migration if any (mode, asset_class, filter_path) combination is missing for the 12 required filter_paths × 4 combinations.
12. Add 2 new unit-test files: `b79-0n-storage-required-assetclass.test.ts` + `b79-0n-storage-sqe-asset-class-routing.test.ts`. **Per Langston Step 2 ACK additional ask:** the SQE routing test MUST include a cache-isolation case — warm `cachedThresholds` with key `paper:crypto_spot`, then read `paper:xstock_spot`, assert the second read does NOT return the crypto entry. Locks the cache-key extension `${mode}:${assetClass}` against silent regression.

**Files changed total estimate:** 1 (storage.ts) + 1 (signal_quality_evaluator.ts) + 1 (signal-orchestrator.ts) + 1 (ready_to_buy_service.ts) + 1 (fx5-scanner.ts) + 1 (config-update-service.ts) + 2 (index.ts + routes.ts in server root) + 2 (routes/vts.ts + scripts/diagnostic-11.4G-5.ts) + 2 new test files + maybe 1 migration = **12 files**.

**LOC estimate:** ~120 lines net (signature changes are small; the test files + migration are the bulk).

---

## §8 — Crypto-by-construction-NONE invariant (re-verified)

- Every (a) site explicitly passes `'crypto_spot'` — semantically identical to today's silent default.
- The (c) site (SQE bug) routes by signal's asset class — crypto signals get crypto thresholds (same as today), xStock signals get xStock thresholds (NEW behavior; bug fix).
- Every (d) site calls `getCanonicalScreenerConfig` which internally passes `'crypto_spot'` — semantically identical.
- Seed migration adds xStock rows; does NOT touch crypto rows.
- No code path that today reads crypto-intended config can be re-routed.

Crypto cycles see ZERO runtime behavioral change. 24h regression-lock confirms empirically per umbrella §2.2.

---

## §9 — Open questions for Langston (Step 2 review)

(Q-S2-1) **`getCanonicalScreenerConfig` helper signature.** Proposed:
```ts
async getCanonicalScreenerConfig(params: {
  mode: 'live' | 'paper';
  filterPath?: string;
}): Promise<ScreenerFilters | null> {
  // Returns the canonical crypto-spot baseline. NOT for asset-class-aware routing.
  // Use getScreenerFilters({ mode, assetClass, filterPath? }) for runtime decisions.
  return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
}
```
Acceptable shape, or do you prefer a different signature (e.g., explicit `displayPurpose: true` flag on the main method)?

(Q-S2-2) **`screener_filters` seed migration commit timing.** Pre-audit identifies the seed migration as a deploy-time prerequisite. Two options:
- (A) Ship seed migration FIRST as a standalone commit (idempotent ON CONFLICT DO NOTHING), then ship the code change in a second commit. Deploy as a single deploy chain (`db:migrate && build && pm2 restart`).
- (B) Bundle seed + code into one commit + one deploy.

CC default: (B) — single commit easier to revert if anything regresses; idempotent seed is safe to re-run.

(Q-S2-3) **SQEInput.assetClass — required field, or required-with-test-helpers.** Tests that construct SQEInput objects (e.g., `sqe-config-dynamic.test.ts`) will need to populate the new field. Some tests are mocking the SQEInput shape and don't care about the asset class semantically. Approach: require the field strictly + test helpers populate `'crypto_spot'` as the default test value, OR introduce a test-only default? CC default: strict required — tests update to pass the field explicitly.

(Q-S2-4) **Module-constants per-class deferral RUNNING_ISSUES wording.** Proposed entry: "B79.0n.STORAGE deferred per-class `module_constants.sqe_config` rows to SCORING batch. Current state: screener_filters is per-class (this batch), module_constants is wildcard. Asymmetry acceptable because screener_filters is Layer 1 primary source; module_constants is Layer 2 fallback hit only when filters has no row or missing field." Acceptable wording, or want different framing?

(Q-S2-5) **Live row-coverage check.** Should the row-coverage psql run BEFORE pre-audit dispatches to you (so you see the actual count in the pre-audit), OR is it OK to defer to Step 3 start (so the implementation chain ships the count + seed in one go)? CC default: defer to Step 3 start — but happy to run now if you prefer the visibility.

---

## §10 — Step 2 ACK ask

Pre-audit ready for Langston Step 2 ACK. Concerns A/B/C resolved. 5 follow-up questions in §9. On ACK, proceed to Step 3 implementation per §7's 12-step plan. Crypto-regression-NONE invariant locked by §8 reasoning.
