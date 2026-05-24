# B79.0n.PATTERN-DETECT Step 3 Change List (commit `2fc09f0`)

**For Langston Step 4 code review. Embedded diff snippets per CLAUDE.md §6.5.0.a.**

**Branch:** migration/aws-supabase
**Push commit:** `2fc09f0`
**Prior:** scope `d050040`, pre-audit `74f420b`, Step 1 ACK + Step 2 ACK consensus.
**Local gates:** tsc baseline 494 (zero regression); 96 tests pass across 6 files.

**INFRASTRUCTURE NOTE:** DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. The staging server at `ssh staging` (deploy@188.245.193.8, IP-restricted to your Helsinki IPv4) has the same code at the same commit; use that for any repo-side inspection.

---

## 17 files changed (+831 / −89)

### NEW (6 files)

1. `drizzle/migrations/2026-05-24b-b79-0n-pattern-detect-naming-converge.sql` (49 lines)
2. `drizzle/migrations/2026-05-24b-b79-0n-pattern-detect-naming-converge-rollback.sql` (35 lines)
3. `server/tests/unit/b79-0n-pattern-detect-required-assetclass.test.ts` (12 tests, 117 lines — 12 @ts-expect-error type-locks)
4. `server/tests/unit/b79-0n-pattern-detect-f1-invariance.test.ts` (12 tests, 76 lines)
5. `server/tests/unit/b79-0n-pattern-detect-byte-identity.test.ts` (5 tests, 117 lines)
6. `server/tests/unit/b79-0n-pattern-detect-naming-convergence.test.ts` (10 tests, 162 lines)

### MODIFIED (11 files)

7. `drizzle/migrations/MANIFEST.txt` — append migration file name
8. `server/services/pattern-recognizer.ts` — REQUIRED-assetClass on scanPatterns + 6 detect + patternToTradeSignal + class methods
9. `server/services/signal-orchestrator.ts` — 5 caller sites threaded (4 scanPatterns + 1 patternToTradeSignal)
10. `server/services/vts-runner.ts` — 4 caller sites threaded (3 scanPatterns via resolveAssetClass + selectContextAwareStrategy)
11. `server/asset_classes/xstock_spot/eval-cycle.ts` — 1 scanPatterns caller threaded
12. `server/scripts/diagnostic-11.4G.ts` — 2 caller sites threaded
13. `server/config/canonical-regime-strategy-map.ts` — selectContextAwareStrategy REQUIRED-assetClass parameter
14. `server/asset_classes/crypto_spot/pattern-pool-filters.ts` — AssetClass type unification (line 76)
15. `server/asset_classes/xstock_spot/pattern-pool-filters.ts` — full file rewrite (getter shape + @deprecated shim)
16. `server/tests/unit/pattern-recognizer.test.ts` — 14 call-site updates (12 scanPatterns + 2 patternToTradeSignal)
17. `server/tests/unit/multi-timeframe.test.ts` — 3 call-site updates

---

## §1 Migration SQL — `2026-05-24b-b79-0n-pattern-detect-naming-converge.sql`

```sql
BEGIN;

-- (1) Rename: final_score_floor -> pattern_final_score_min
UPDATE module_constants
   SET constant_name = 'pattern_final_score_min',
       updated_by    = 'B79.0n.PATTERN-DETECT_naming_converge',
       updated_at    = NOW()
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name = 'final_score_floor';

-- (2) Rename: max_position_pct -> pattern_max_position_pct  (same WHERE skeleton)

-- (3) Seed xstock RSI bounds (crypto defaults clone — Layer-3 calibration TBD)
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'pattern_rsi_min', '15'::jsonb, 'B79.0n.PATTERN-DETECT_clone_crypto_default'),
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'pattern_rsi_max', '85'::jsonb, 'B79.0n.PATTERN-DETECT_clone_crypto_default')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;  -- preserve pre-existing manual tuning if re-run

COMMIT;
```

**Idempotent:** UPDATE 0 rows if already renamed; ON CONFLICT DO NOTHING preserves manual tunes.
**Crypto NONE-by-construction:** only xstock_spot rows touched.
**Q-B verified:** zero current consumers of legacy row names (pre-audit §-0 grep result).

---

## §2 Pattern recognizer signatures — `server/services/pattern-recognizer.ts`

### BEFORE (representative)
```ts
function detectPinbar(candles: Candle[], symbol: string, avgVolume: number): PatternSignal | null { ... }
function detectMorningStar(candles: Candle[], symbol: string): PatternSignal | null { ... }
function detectABCD(candles: Candle[], symbol: string): PatternSignal | null { ... }

export function scanPatterns(candles: Candle[], symbol: string = 'UNKNOWN'): PatternSignal[] {
  const pinbar = detectPinbar(candles, symbol, avgVolume);
  ...
}

export function patternToTradeSignal(pattern: PatternSignal, currentPrice: number, atr: number = 0): {...}

class PatternRecognizerService {
  scanPatterns(candles: Candle[], symbol: string): PatternSignal[] { ... }
  patternToTradeSignal(pattern: PatternSignal, currentPrice: number, atr?: number) { ... }
}
```

### AFTER
```ts
import type { AssetClass } from '@shared/asset-classes';

function detectPinbar(candles: Candle[], symbol: string, avgVolume: number, assetClass: AssetClass): PatternSignal | null { ... body unchanged }
function detectMorningStar(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null { ... body unchanged }
function detectABCD(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null { ... body unchanged }
// (also detectEngulfing, detectInsideBar, detectThreeSoldiers — same pattern)

export function scanPatterns(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal[] {
  const pinbar = detectPinbar(candles, symbol, avgVolume, assetClass);
  // ... 6 detect calls all thread assetClass through
}

export function patternToTradeSignal(
  pattern: PatternSignal,
  currentPrice: number,
  atr: number,           // was: number = 0; now REQUIRED
  assetClass: AssetClass, // NEW REQUIRED
): {...}

class PatternRecognizerService {
  scanPatterns(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal[] {
    return scanPatterns(candles, symbol, assetClass);
  }
  patternToTradeSignal(pattern: PatternSignal, currentPrice: number, atr: number | undefined, assetClass: AssetClass) {
    return patternToTradeSignal(pattern, currentPrice, atr ?? 0, assetClass);
  }
}
```

**Body branching:** ZERO. PATTERN-DETECT is plumbing-only — all 11 detect-function thresholds preserved byte-identical for crypto. Layer-3 deferred.

**Note on atr `= 0` default removal:** the pre-batch signature had `atr: number = 0` as a default to allow 3-arg calls; the post-batch signature makes it required because adding a required parameter AFTER an optional one is awkward in TS. Class-method wrapper bridges with `atr: number | undefined` → `atr ?? 0` so external callers retain "undefined is fine" semantics.

---

## §3 Production caller threading — `signal-orchestrator.ts` (4 sites)

### Sites 1-2 — crypto active trading (line ~1355)
```ts
// BEFORE
const patternSignals = getPatternRecognizer().scanPatterns(candles, symbol);
const tradeSignal = getPatternRecognizer().patternToTradeSignal(patternSig, currentPrice, atr);

// AFTER
const patternSignals = getPatternRecognizer().scanPatterns(candles, symbol, 'crypto_spot');
const tradeSignal = getPatternRecognizer().patternToTradeSignal(patternSig, currentPrice, atr, 'crypto_spot');
```

### Site 3 — first cascade entry (line ~1663)
```ts
// BEFORE
let patternSignals = patternRecognizer.scanPatterns(candles, symbol);
// AFTER
let patternSignals = patternRecognizer.scanPatterns(candles, symbol, 'crypto_spot');
```

### Sites 4-6 — multi-timeframe cascade fan-out (lines 1684-1686)
```ts
// AFTER (3 sites; same shape — assetClass='crypto_spot' literal in orchestrator scope)
const globalPatterns = globalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
const tacticalPatterns = tacticalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
const precisionPatterns = precisionPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
```

### Site 7 — pattern→trade fallback (line ~1874)
```ts
// AFTER
const tradeSignal = patternRecognizer.patternToTradeSignal(patternSig, currentPrice, atr, 'crypto_spot');
```

---

## §4 Production caller threading — `vts-runner.ts` (4 sites)

### Sites 1-3 — scanPatterns (lines 941, 3254, 3316)
All use `resolveAssetClass(symbol, 'kraken')` — matching the convention already established at line 3219 for MCE. Resolver handles xstock/crypto disambiguation via `XSTOCK_SPOT_SYMBOLS` membership check.

```ts
// BEFORE
const detectedPatterns = preDetectedPatterns ?? scanPatterns(candles, symbol);
const detectedPatterns = scanPatterns(candles, pair.symbol);  // x2 (outer + inner loop)

// AFTER
const detectedPatterns = preDetectedPatterns ?? scanPatterns(candles, symbol, resolveAssetClass(symbol, 'kraken'));
const detectedPatterns = scanPatterns(candles, pair.symbol, resolveAssetClass(pair.symbol, 'kraken'));  // x2
```

### Site 4 — selectContextAwareStrategy (line ~967)
```ts
// AFTER
const strategySelection = selectContextAwareStrategy(
  regime,
  detectedPattern?.pattern ?? null,
  sHash,
  resolveAssetClass(symbol, 'kraken'),  // NEW
);
```

---

## §5 xstock_spot eval-cycle threading

```ts
// BEFORE (line 408)
const detectedPatterns = scanPatterns(candles, symbol);

// AFTER
// xstock VTS path passes the file-scope ASSET_CLASS = 'xstock_spot' const.
const detectedPatterns = scanPatterns(candles, symbol, ASSET_CLASS);
```

---

## §6 selectContextAwareStrategy — `canonical-regime-strategy-map.ts`

```ts
// BEFORE
export function selectContextAwareStrategy(
  regime: CanonicalRegimeType,
  detectedPattern: string | null,
  symbolHash?: number
): {...}

// AFTER (plumbing-only per R-2 (A); body unchanged)
export function selectContextAwareStrategy(
  regime: CanonicalRegimeType,
  detectedPattern: string | null,
  symbolHash: number | undefined,
  assetClass: import('../../shared/asset-classes.js').AssetClass,
): {...}
// Body still operates on CANONICAL_REGIME_STRATEGY_MAP[regime] —
// crypto byte-identity preserved by construction.
```

Note: dynamic import-type used because adding a top-level `import` to canonical-regime-strategy-map.ts caused circular-dep risk (file is imported by ~everyone); the dynamic import-type form does not generate a runtime require, only a compile-time check.

---

## §7 AssetClass type unification — `crypto_spot/pattern-pool-filters.ts`

```ts
// BEFORE (line 76 — bug: shadowed canonical type, gave consumers narrow guarantee)
export type AssetClass = 'crypto_spot'; // Extend when new asset classes added

// AFTER
export type { AssetClass } from '@shared/asset-classes';
```

**Ripple verified:** `active-filter-pool.ts:24` consumes this type re-export; post-batch it now gets the full AssetClass union (crypto_spot | crypto_perp | xstock_spot | xstock_perp | ...) for free.

---

## §8 xstock_spot/pattern-pool-filters.ts — FULL REWRITE

### Pre-batch (44 lines, constants-only leaf)
- `XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45` literal
- `XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50` literal
- `XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS` frozen object
- ZERO importers verified via Step 2 grep (`XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR` / `XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT` → 0 hits outside file itself)

### Post-batch (108 lines, getter shape mirroring crypto_spot)
```ts
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
const _PATTERN_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' };

export const XSTOCK_PATTERN_POOL_THRESHOLDS = {
  get RSI_MIN(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_min', _PATTERN_KEY); },
  get RSI_MAX(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_max', _PATTERN_KEY); },
};

export const XSTOCK_PATTERN_POOL_GUARDRAILS = {
  get FINAL_SCORE_FLOOR(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min', _PATTERN_KEY); },
  get MAX_POSITION_PCT(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_max_position_pct', _PATTERN_KEY); },
};

/** @deprecated B79.0n.PATTERN-DETECT — use XSTOCK_PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR. Phase 16 removal. */
export const XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45;
/** @deprecated ... */
export const XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50;
/** @deprecated ... */
export const XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS = Object.freeze({
  finalScoreFloor: XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR,
  maxPositionPct: XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT,
});
```

**Shim status (per Q-B confirmation):** pure belt-and-suspenders. Zero importers verified by grep across server/, shared/, scripts/. RUNNING_ISSUES #136 (u) registers for Phase 16 removal.

---

## §9 Verification gates (Step 3 chunk G)

```
[baseline] Current: 494 errors. Baseline: 494 errors.
[baseline] OK — no regressions above baseline.

Test Files  6 passed (6)
     Tests  96 passed (96)
   Duration  1.39s
```

Files run:
- b79-0n-pattern-detect-required-assetclass.test.ts (12 tests, 12 @ts-expect-error)
- b79-0n-pattern-detect-f1-invariance.test.ts (13 tests)
- b79-0n-pattern-detect-byte-identity.test.ts (5 tests)
- b79-0n-pattern-detect-naming-convergence.test.ts (10 tests)
- pattern-recognizer.test.ts (12 tests — existing, all passing post-signature ripple)
- multi-timeframe.test.ts (44 tests — existing, all passing)

**Total: 96 passing, 0 failing, 0 skipped.**

---

## §10 What CC asks Langston to focus the review on

1. **§2 patternToTradeSignal default-removal** — pre-batch signature had `atr: number = 0`; post-batch makes it required. Class-method wrapper bridges with `atr: number | undefined` → `atr ?? 0` for back-compat semantic. Is this the right shape, or do you want atr to stay optional with the assetClass parameter coming before atr to preserve default-eligibility?

2. **§6 selectContextAwareStrategy import-type dynamic form** — used `import('../../shared/asset-classes.js').AssetClass` instead of a top-level `import` to dodge potential circular-dep with the canonical map. Is this acceptable, or do you want the top-level import (and validate no actual circular dep at runtime via tsc / vitest)?

3. **§4 vts-runner resolveAssetClass(symbol, 'kraken') vs literal 'crypto_spot'** — the convention at line 3219 already uses `resolveAssetClass(pair.symbol, 'kraken')`, so I mirrored it for the 3 scanPatterns sites + the selectContextAwareStrategy site. Trade-off: dynamic resolution costs a regex match per call but forward-loads correctly if vts-runner ever sees xstock symbols. Literal 'crypto_spot' would be cheaper but locks in the crypto-only assumption. **CC recommends keep resolveAssetClass** — matches existing convention.

4. **§8 xstock_spot/pattern-pool-filters.ts deprecated shim** — kept 3 deprecated const exports per Q-B confirmation (belt-and-suspenders). Phase 16 register entry (u) opens for clean-up. OR do you want them deleted now since Step 2 §-0 grep confirmed zero importers?

5. **Test file naming-convergence.test.ts** — uses vitest `vi.mock` for the resolver. Is this the right shape, or do you prefer a different module-mock strategy?

6. **F-1 invariance test** — locks `CANONICAL_PATTERN_TYPES` to exact 6+null shape. Future additions to the canonical pattern list would break this test (deliberately). Do you want a softer assertion?

7. **General:** any chunk-level concerns about anti-graveyard discipline (12 new @ts-expect-error in the dedicated harness file — all documented one-line) or threading approach.

---

## §11 Per-chunk verification ready-for-Step-5

| Chunk | Files | Verification | Status |
|---|---|---|---|
| A — Migration SQL | 2 (forward + rollback) + MANIFEST | tsc clean; idempotent SQL | ✅ |
| B — Recognizer signatures | 1 (pattern-recognizer.ts) | tsc clean; type-lock tests pass | ✅ |
| C — Production callers | 4 files (sig-orch + vts-runner + xstock-eval + diag) | tsc clean | ✅ |
| D — Pattern-pool-filters rewrites | 2 files (crypto + xstock) | naming-convergence tests pass | ✅ |
| E — selectContextAwareStrategy | 3 files (definition + 2 callers) | tsc clean; type-lock test pass | ✅ |
| F — Tests | 4 new + 3 existing | 96 tests pass | ✅ |
| G — Local verify | n/a | baseline 494 unchanged | ✅ |

**Push commit:** `2fc09f0` to migration/aws-supabase.
**CI status:** in_progress (run ID 26372040148). Will reach you in ~5-10 min.
**Awaiting your Step 4 ACK to proceed to Step 6 (staging deploy).**
