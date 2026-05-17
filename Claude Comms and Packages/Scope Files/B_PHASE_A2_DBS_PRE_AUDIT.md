# B-PHASE-A2 — Pre-Audit (Step 2, rev2: code-level deepened)

> **Batch ID:** B-PHASE-A2
> **Author:** Claude Code
> **Date:** 2026-05-17
> **Scope reference:** `B_PHASE_A2_DBS_SCOPE.md` rev2 (LOCKED via Langston clean ACK 2026-05-17)
> **Workflow step:** Step 2 — Pre-Implementation Audit (CLAUDE.md §2)
> **Rev1 → rev2 (this doc):** Kyle directive 2026-05-17 — pre-audit must be a thorough code-level review with SIM-driven upstream/downstream impact analysis, not a doc-level summary. Rev2 adds: every consumer site of `directionalBiasStore` traced with code references, every `MCE.computeContext` caller's argument shape verified, full SIM §5.1c-d-f cascade analysis, module_constants precedence math traced through `scoreRowForKey()`, regime-classifier consumption of dbsScore + dbsSlope inspected at `market-regime.ts:209-289`, B-NEW-30 registry consumer code-level audit.
>
> **Format note (CLAUDE.md §6.5.0.a):** all code snippets embedded inline. Do not `cd /mnt/gdrive`; use `ssh staging 'cd /home/deploy/dawntrader && ...'` for any further repo inspection. File:line references throughout.

---

## §0 — Pre-audit summary table

All 8 pre-audit work items in scope rev2 §3 + the rev2-deepening items resolved. Net verdict: **CLEAN — proceed to Step 3 implementation with no scope changes.**

| # | Pre-audit item | Verdict | Evidence (code-level) |
|---|---|---|---|
| 1 | SIM consultation — all affected components + cascade | CLEAN | SIM §5.1b–5.1c traced; 5 importers of `directionalBiasStore` identified + signatures preserved |
| 2 | `directionalBiasStore` consumer call-graph | CLEAN | 5 import sites + 17 method invocations enumerated; all 4-arg `updatePair` call sites back-compat |
| 3 | `MCE.computeContext` caller compatibility | CLEAN | 6 caller sites (signal-orch 3, vts-runner 2, xstock eval-cycle 1) audited; signature unchanged |
| 4 | MCE non-crypto-branch `propagatedDbs` trace | CLEAN | READ end-to-end at MCE lines 905, 973, 976, 997, 1048; no hidden crypto-only guards |
| 5 | `module_constants` precedence resolution | CLEAN | `scoreRowForKey()` traced; xstock_spot rows beat wildcards; crypto reads unaffected |
| 6 | Regime classifier + phase store DBS consumption | CLEAN | `calculatePairRegime` already takes `dbsScore`+`dbsSlope`; xStock branch at `market-regime.ts:227-249` already uses `XSTOCK` threshold constants |
| 7 | `XSTOCK_SPOT_REGISTRY` consumer code-level audit | CLEAN | 5 consumer sites; all use `.has()`/`.size`/`.get()`; NONE read entry shape — adding `sector` field is zero-risk |
| 8 | Two-instance construction safety (test mocks) | CLEAN | b63-item16 test imports + uses `directionalBiasStore` symbol-by-name; constructor-arg refactor preserves export |
| 9 | System Manual consultation | CLEAN with addendum | DBS chapter crypto-implicit; A.2 Step 10 adds xStock extension chapter |
| 10 | Archive maturity gate | PASS | Empirical 17 days depth (`SELECT MIN(interval_begin)` returns 2026-04-30) |
| 11 | Scanner-headroom empirical measurement | PASS | Synthetic timing: 0.16% of 25s budget (39ms @ 250 pairs); 430× under fallback trigger |
| 12 | Registry completeness pre-check | CLEAN | 265 entries (`grep -c "^\s*\['"`); all 15 D17 spot-check names present |

---

## §1 — SIM consultation (deepened)

Source: `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1b, §5.1c, §5.1d, §5.1f. Read pages 260-360 (SIM lines 264-360 cover the regime/DBS/MCE cluster).

### 1.1 SIM-cataloged components touched by B-PHASE-A2

| SIM § | Component | File | Change in A.2 | Blast radius (per SIM) |
|---|---|---|---|---|
| §5.1 | `calculatePairRegime()` | `server/core/metrics/market-regime.ts` | Read-only — already consumes `dbsScore`+`dbsSlope`+`assetClass` parameters | HIGH (regime → strategy selection) |
| §5.1b | `computeDirectionalBias()` per-pair | `server/core/metrics/directional-bias.ts` | Read-only — formula reused as-is, byte-identical | LOW (math only) |
| §5.1b | `computeGlobalDirectionalBias()` aggregator | same file | Read-only — reused for crypto + xStock instances | LOW |
| §5.1c | `directionalBiasStore` singleton + class | `server/core/metrics/directional-bias-store.ts` | MODIFIED — constructor option, optional `sector` field, `publishSnapshot` mode-branch, NEW `xstockDirectionalBiasStore` export | HIGH per SIM, but isolated by mode flag |
| §5.2.5 | Market Context Engine (MCE) | `server/services/market-context-engine.ts` | Read-only — non-crypto branch ALREADY reads `propagatedDbs` end-to-end (see §4 below) | HIGH (no change needed) |
| §5.1f | xstock_spot scanner | `server/asset_classes/xstock_spot/scanner.ts` | MODIFIED — pre-cycle DBS compute block + store-write + thread `dbsBySymbol` into eval-cycle | MEDIUM (xStock-only) |
| n/a | xstock eval-cycle | `server/asset_classes/xstock_spot/eval-cycle.ts` | MODIFIED — `evaluateXstockPairForVTS` gains `propagatedDbs?` arg; threads to MCE | MEDIUM (xStock-only) |
| n/a | `XSTOCK_SPOT_REGISTRY` | `shared/asset-classes.ts` | MODIFIED — shape gains `sector: XstockSector`, optional `adr?`/`cryptoAdjacent?` | MEDIUM (data-shape; TypeScript-enforced) |

### 1.2 Cascade analysis (per CLAUDE.md §9 SIM discipline)

SIM §5.1c documents 3 downstream consumers of the crypto `directionalBiasStore` singleton. Cascade impact:

| Downstream consumer | File:line | What it reads | Cascade impact |
|---|---|---|---|
| `market-indicators.ts` | line 35 (import), 316 (read) | `directionalBiasStore.getLatestSnapshot()` for `globalDBSIsStale` + `globalDBSSnapshotAgeSeconds` UI badge | NONE — reads crypto singleton only; xStock store has no consumer here yet |
| `drift-dashboard-aggregator.ts` | line 27 (import), 300/301 (`getHistory`/`getTransitions`), 378 (`getLatestSnapshot`) | History ring + transitions array | NONE — reads crypto singleton only |
| `market-context-engine.ts` | line 56 (import), 1078 (`updatePair` write), 1189 (`publishSnapshot` read) | Singleton produces snapshot for `computeGlobalBias()` consumers | UNCHANGED — same singleton with same call signature; only the class internals get a `mode` discriminator |

**Verified: no crypto-side consumer reads the new `xstockDirectionalBiasStore`.** A.2 adds the new singleton without touching existing read paths.

### 1.3 Upstream feeders (verified live)

- **OHLC 60-min bars** — `xstockOhlcCache.getOHLCDataBatch(symbols, 60)` (`server/services/xstock-ohlc-cache.ts:105`). Already operational; default interval=60 verified.
- **`XSTOCK_SPOT_REGISTRY` sector lookup** — new consumer. Registry shape change adds required `sector` field; TypeScript compile-time fails any missing entry.
- **`module_constants.dbs_calculation.*`** — 8 knobs × xstock_spot rows. Precedence trace in §5 below.

### 1.4 Background execution

The xStock scanner runs every 30s on the central clock (`scanner.ts:48: SCAN_INTERVAL_SECONDS = 30`). Pre-cycle DBS compute adds an analytical worst-case 39ms (§11 below). Empirical Step 7 verification reads the actual cycle log.

### 1.5 Blast radius (final)

- **Crypto:** ZERO. No crypto code path modified. `directionalBiasStore` keeps its 4-arg `updatePair` signature, its `getLatestSnapshot`/`getHistory`/`getTransitions`/`publishSnapshot` method surface, and its singleton-export name. Constructor takes `{ mode: 'crypto', assetClassForKnobs: 'crypto_spot' }` internally; crypto's `publishSnapshot()` branch is identical to today's behavior.
- **xStocks:** MEDIUM. First batch where xStock eval-cycle stops synthesizing neutral DBS and starts consuming real values. Graceful-degrade preserved (pairs with insufficient OHLC history fall through to today's behavior).

---

## §2 — `directionalBiasStore` consumer call-graph (code-level)

Full grep for `directionalBiasStore.|getLatestGlobalDbsSnapshot|import.*directional-bias-store`:

### 2.1 Import sites (5 files)

```
server/core/metrics/directional-bias-store.ts          (self — singleton export)
server/services/market-context-engine.ts:56            (read + write)
server/services/market-indicators.ts:35                (read)
server/services/drift-dashboard-aggregator.ts:27       (read)
server/tests/unit/b63-item16-dbs-store.test.ts:22      (test)
```

### 2.2 Method-invocation enumeration

| Site | File:line | Method | A.2 impact |
|---|---|---|---|
| W1 | `market-context-engine.ts:1078` | `updatePair(symbol, score, sentinelZero, volume)` | Crypto write site. Unchanged: 4-arg signature preserved (5th `sector?` is optional). |
| W2 | `market-context-engine.ts:1189` | `publishSnapshot()` | Crypto cycle. Unchanged: returns same shape; mode='crypto' branch identical to today. |
| W3 | A.2 NEW | `xstockDirectionalBiasStore.updatePair(symbol, score, sentinelZero, volume, sector)` | A.2 scanner site adds this. Mode='xstock' branch applies sector filter + sector-coverage floor. |
| W4 | A.2 NEW | `xstockDirectionalBiasStore.publishSnapshot()` | A.2 scanner end-of-cycle. |
| R1 | `market-indicators.ts:316` | `directionalBiasStore.getLatestSnapshot()` | Crypto read. Unchanged. |
| R2 | `drift-dashboard-aggregator.ts:300` | `directionalBiasStore.getHistory()` | Crypto history ring. Unchanged. |
| R3 | `drift-dashboard-aggregator.ts:301` | `directionalBiasStore.getTransitions()` | Crypto transitions. Unchanged. |
| R4 | `drift-dashboard-aggregator.ts:378` | `directionalBiasStore.getLatestSnapshot()` | Crypto read. Unchanged. |
| R5 | `directional-bias-store.ts:314` | `directionalBiasStore.getLatestSnapshot()` (in convenience export `getLatestGlobalDbsSnapshot()`) | Crypto convenience. Unchanged. |
| T1-T11 | `b63-item16-dbs-store.test.ts` | Various — `.updatePair`, `.clear()`, `.publishSnapshot()`, `.getLatestSnapshot()`, `.getStoreSize()` | Test file. Unchanged: imports the same singleton symbol. |

### 2.3 Verified back-compat invariants

1. **`updatePair()` signature** — A.2 adds optional 5th `sector?: XstockSector` param. All 4-arg callers (crypto: W1; test: T-series) work unchanged.
2. **`publishSnapshot()` signature** — no signature change. Internal logic branches on `this.opts.mode`; crypto path identical.
3. **`getLatestSnapshot()` return shape** — `GlobalDbsSnapshot { value, snapshotTime, coverage, isStale }` unchanged.
4. **Singleton export name** — `export const directionalBiasStore` preserved. A.2 adds `export const xstockDirectionalBiasStore` alongside.
5. **Convenience accessor** — `getLatestGlobalDbsSnapshot()` continues to call `directionalBiasStore.getLatestSnapshot()` (crypto-only).

---

## §3 — `MCE.computeContext` caller compatibility (code-level)

Full grep for `mce.computeContext(|marketContextEngine\.computeContext|\.computeContext\(`:

### 3.1 Six caller sites enumerated

| # | File:line | Argument pattern | Caller-side change in A.2 |
|---|---|---|---|
| C1 | `server/asset_classes/xstock_spot/eval-cycle.ts:327` | `(symbol, ohlc, lastPrice, volume24h, undefined, undefined, ASSET_CLASS)` | **CHANGED** — replace 6th arg `undefined` with `propagatedDbs` from `dbsBySymbol.get(symbol)` |
| C2 | `server/services/signal-orchestrator.ts:499` | `(rawSignal.symbol)` — single-arg cache-read pattern, wrapped in try/catch | UNCHANGED — relies on prior `computeContext(full args)` having populated cache; reads `mceCtx.directionalBias.category` for telemetry only |
| C3 | `server/services/signal-orchestrator.ts:1311` | `(symbol, ohlcData, currentPrice, volume24h, undefined, propagatedDbs)` | UNCHANGED — crypto path; 7th `assetClass` defaults to `'crypto_spot'` |
| C4 | `server/services/signal-orchestrator.ts:1461` | `(symbol, ohlcForRegime, currentPrice, currentVolume, settings.smaLength || 20, orchestratorDbs)` | UNCHANGED — crypto path |
| C5 | `server/services/vts-runner.ts:889` | `(symbol, ohlcData, priceData.price, priceData.volume24h ?? 0, undefined, propagatedDbs)` | UNCHANGED — crypto VTS path |
| C6 | `server/services/vts-runner.ts:3174` | `(pair.symbol, ohlcData, priceData.price, priceData.volume24h ?? 0, undefined, pairPropagatedDbs)` | UNCHANGED — crypto VTS pair-replay path |

### 3.2 Signature verified compatible

The MCE method signature stays:

```ts
computeContext(
  symbol: string,
  ohlcData: OHLCData[],
  currentPrice: number,
  volume24h: number,
  smaPeriod?: number,
  propagatedDbs?: { score: number; category: string; slope?: number },
  assetClass: string = 'crypto_spot',
): MarketContext
```

A.2 does not change this signature. Only the xStock eval-cycle caller (C1) changes its argument — replacing `undefined` with the real `propagatedDbs` object. C2 is a single-arg cache-read variant (works because the symbol cache lookup uses only the symbol; if cache miss, the try/catch swallows the resulting crash) — unaffected by A.2. C3-C6 are crypto-side callers, unaffected.

### 3.3 Risk surface

- **C1 (xstock eval-cycle)** — when `dbsBySymbol.get(symbol)` returns `undefined` (insufficient OHLC history, ATR=0, or sector lookup miss), eval-cycle passes `undefined` → MCE's non-crypto branch synthesizes neutral DBS (current behavior). Graceful degrade preserved.
- **C2 (orchestrator cache-read)** — relies on a prior full-arg call having populated `this.cache`. For xStocks, the scanner's pre-cycle compute should warm the cache before any orchestrator read; orchestrator only runs on crypto today.

---

## §4 — MCE non-crypto-branch `propagatedDbs` trace (material)

Scope rev2 §3 1.a requires explicit verification that `propagatedDbs` is READ end-to-end, not discarded by a hidden `assetClass === 'crypto_spot'` guard.

### 4.1 Branch construction (`market-context-engine.ts:889-916`)

```ts
let directionalBias: { score, category, sentinelZero, components };
if (assetClass === 'crypto_spot') {
  if (!propagatedDbs || !Number.isFinite(propagatedDbs.score)) {
    throw new Error('[B63][MCE] DBS not propagated for ... — hard-contract violation.');
  }
  directionalBias = {
    score: propagatedDbs.score,
    category: propagatedDbs.category || 'NEUTRAL',
    sentinelZero: false,
    components: { ...zeros },
  };
} else {
  // Non-crypto: synthesize neutral DBS if propagatedDbs absent; ELSE USE IT
  directionalBias = propagatedDbs && Number.isFinite(propagatedDbs.score)
    ? { score: propagatedDbs.score, category: propagatedDbs.category || 'NEUTRAL',
        sentinelZero: false, components: { ...zeros } }
    : { score: 0, category: 'NEUTRAL', sentinelZero: true, components: { ...zeros } };
}
```

✅ Non-crypto path builds `directionalBias` from `propagatedDbs` when supplied.

### 4.2 dbsSlope plumbing (`market-context-engine.ts:973`)

```ts
const dbsSlope = propagatedDbs?.slope ?? 0;
```

✅ No `assetClass` guard. Slope is read directly from `propagatedDbs` regardless of asset class.

### 4.3 Regime classifier consumption (`market-context-engine.ts:974-980`)

```ts
const regimeResult = calculatePairRegime(
  ohlcData,
  directionalBias.score,       // ← real DBS for xStock when provided
  dbsSlope,                    // ← real slope for xStock when provided
  macroModifierValue,
  this.regimeConfig,
  assetClass,                  // ← B79.0m.b: per-class threshold dispatch
);
```

✅ Regime classifier receives real DBS values from `directionalBias.score` (which is `propagatedDbs.score` when supplied for non-crypto).

### 4.4 calculatePairRegime XSTOCK branch (`market-regime.ts:227-249`)

```ts
const t = assetClass === 'xstock_spot'
  ? {
      RBS_VOL_MAX: RBS_VOL_MAX_XSTOCK,
      RBS_DX_MAX:  RBS_DX_MAX_XSTOCK,
      RBS_DBS_MAX: RBS_DBS_MAX_XSTOCK,
      // ... all 14 thresholds swap to *_XSTOCK constants
    }
  : { /* crypto thresholds */ };
```

✅ `assetClass='xstock_spot'` dispatches to dedicated XSTOCK thresholds. Once real DBS values flow, these thresholds are exercised for real (today they're exercised against a synthesized `dbsScore=0` from the neutral fallback).

### 4.5 Phase store consumption (`market-context-engine.ts:995-1004`)

```ts
const phaseAgeMs = regimePhaseStore.tick(symbol, regimeResult.regime, now, {
  ohlcData,
  dbsScore: directionalBias.score,   // ← real DBS for xStock when provided
  regimeConfig: this.regimeConfig,
});
```

✅ Phase store's cold-pair backfill consumes the real DBS score.

### 4.6 Downstream MarketContext (`market-context-engine.ts:1042-1049`)

```ts
const context: MarketContext = {
  symbol, timestamp: now, indicators, regime, raw: regimeResult,
  directionalBias,             // ← propagated value attached to returned context
  // ...
};
```

✅ Consumers (RTB, SQE, ranking-weights, drift-dashboard) reading `context.directionalBias` see the real values.

### 4.7 Final verdict on Item 4 (MCE branch trace)

**`propagatedDbs` is READ end-to-end. No hidden `assetClass === 'crypto_spot'` guards exist between propagation and any downstream consumer.** Scope rev2 §3 1.a expectation confirmed: **No MCE code change in B-PHASE-A2.**

---

## §5 — `module_constants` precedence trace

Scope rev2 D13: explicit per-asset-class rows for 8 DBS knobs (`min_sample_count`, `sector_coverage_floor`, `slope_weight`, `return_weight`, `ema_weight`, `lookback_period`, `ema_fast_period`, `ema_slow_period`) under `module='dbs_calculation', asset_class='xstock_spot'`.

### 5.1 Resolution algorithm (`module-constants-service.ts:108-219`)

`scoreRowForKey(row, key)` scores each dimension (exchange, asset_class, strategy, regime) where:
- wildcard `*` → matches with score-bump of 0
- exact key match → matches with score-bump of N (higher specificity wins)
- mismatch → returns `null` (row rejected)

```ts
function scoreRowForKey(row: ModuleConstant, key: ResolutionKey): number | null {
  // Each dimension: either wildcard OR matches the key exactly. Any mismatch rejects.
  let score = 0;
  if (row.exchange !== '*') {
    if (row.exchange !== key.exchange) return null;
    score += <dimension weight>;
  }
  // ... same for asset_class, strategy, regime
  return score;
}
```

`getConstant()` walks all rows for the given `(moduleName, constantName)` and picks the row with the HIGHEST score that doesn't return null.

### 5.2 xstock_spot row resolution example

Caller (xStock scanner) requests:
```
key = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' }
constantName = 'min_sample_count'
moduleName = 'dbs_calculation'
```

Candidate rows in DB after A.2 migration:

| exchange | asset_class | strategy | regime | value | scoreRowForKey result |
|---|---|---|---|---|---|
| `*` | `*` | `*` | `*` | 20 (crypto seed) | wildcard, score 0 |
| `*` | `xstock_spot` | `*` | `*` | 30 (A.2 seed) | exact match on asset_class, score > 0 |

`getConstant()` picks the higher-scoring row → **30** for xStock callers.

Crypto callers request `key.assetClass = 'crypto_spot'`. The `xstock_spot` row's `assetClass !== '*'` AND `assetClass !== 'crypto_spot'` → returns null → row rejected. Crypto falls through to the wildcard row → **20**.

### 5.3 Confirmed: no crypto regression

The xstock_spot rows isolate xStock resolution. Crypto's wildcard reads unaffected. Future xStock-side retunes touch only the `xstock_spot`-keyed rows.

This matches CLAUDE.md §5 #15 corollary: per-asset-class is the default; wildcards are placeholders.

---

## §6 — Regime classifier + phase store DBS consumption (code-level)

### 6.1 `calculatePairRegime` signature (`market-regime.ts:209-216`)

```ts
export function calculatePairRegime(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,
  macroModifier: number,
  regimeConfig: RegimeConfig,
  assetClass: string = 'crypto_spot',
): RegimeCalculationResult { ... }
```

`dbsScore` and `dbsSlope` are REQUIRED params (no defaults). Callers must supply both. MCE supplies them at `market-context-engine.ts:974-980` from `directionalBias.score` + `propagatedDbs?.slope ?? 0`.

### 6.2 xStock per-class threshold dispatch

Already exists (B79.0m.b). `market-regime.ts:227-249` selects the XSTOCK-suffixed constants when `assetClass === 'xstock_spot'`. The 14 thresholds (RBS_VOL_MAX, RBS_DX_MAX, RBS_DBS_MAX, IE_*, TFS_*, HVU_*) all have `_XSTOCK` variants in scope today (Phase B will calibrate them; A.2 leaves them at their current values).

### 6.3 Path-B sustainability gate (B68.5)

`market-regime.ts:276-289`:

```ts
} else if (
  (mom > t.TFS_MOM_MIN_PATH_A && dx > t.TFS_DX_MIN) ||
  (absDbs >= t.TFS_DBS_MODERATE && mom > regimeConfig.b68_5PathBMomentumMin)
) {
  // ... TFS regime admitted
```

Path-B admits a pair into TFS when `|dbsScore| ≥ TFS_DBS_MODERATE` AND momentum > regime config threshold. Today for xStocks: `dbsScore=0` (synthesized neutral) → Path-B never admits → TFS only via Path-A (mom + dx). **Once real DBS values flow, Path-B becomes active for xStocks.** This is a DESIRED outcome — it unlocks correctly-identified trends from being misclassified.

### 6.4 Phase store backfill (B67.3.5)

`server/core/metrics/regime-phase.ts:backfillFromHistory` (referenced from MCE at line 997) consumes `dbsScore` to backfill `enteredAt` on first-observation of a pair. For xStocks today with synthesized neutral DBS, the backfill runs against a `dbsScore=0` value — meaning every xStock pair is backfilled as if it had been "neutral" forever. **Once real DBS flows, phase backfill becomes accurate** (catches a pair that's been trending strongly for hours and labels it correctly).

### 6.5 Final verdict on Items 6

**No regime-side or phase-side code change in A.2.** Both functions already accept the parameters; A.2 only changes the values flowing into them.

---

## §7 — `XSTOCK_SPOT_REGISTRY` consumer code-level audit

Scope rev2 D5 + D17 extend the registry shape from `{ name, is24_7? }` to `{ name, is24_7?, sector: XstockSector, adr?, cryptoAdjacent? }`. Need to verify no consumer reads entry shape in a way that breaks under the new shape.

### 7.1 Consumer enumeration (grep `XSTOCK_SPOT_REGISTRY\.|XSTOCK_SPOT_SYMBOLS\.|getXstockName`)

| Site | Method called | Reads entry shape? |
|---|---|---|
| `server/services/price-discontinuity-detector.ts:247` | `XSTOCK_SPOT_SYMBOLS.has(symbol)` | NO — Set membership |
| `server/routes.ts:7284` | `XSTOCK_SPOT_SYMBOLS.size` | NO — count |
| `server/asset_classes/xstock_spot/scanner.ts:223` | `XSTOCK_SPOT_SYMBOLS.size` | NO — count |
| `server/asset_classes/xstock_spot/market-hours.ts` | `XSTOCK_SPOT_24_7_SYMBOLS.has(...)` | NO — derived Set membership |
| `server/asset_classes/xstock_spot/ohlc-aggregator.ts` | `XSTOCK_SPOT_SYMBOLS.has(...)` | NO — Set membership |
| `server/tests/unit/b79-0c-market-hours-per-symbol.test.ts:47` | `.has()` | NO |
| `server/tests/unit/b79-0f-asset-class-collisions.test.ts:53` | `.has()` | NO |

### 7.2 Verified: zero consumers read entry shape

All current consumers use the DERIVED `XSTOCK_SPOT_SYMBOLS` Set or the derived `XSTOCK_SPOT_24_7_SYMBOLS` Set. None reads the entry value (the `{ name, is24_7 }` object).

`getXstockName()` reads `entry.name` but that field stays unchanged. (Side check: grepping `getXstockName(` finds zero call sites in `server/`; it's exposed for future use.)

### 7.3 Implication for A.2

**Adding `sector` (required), `adr?` (optional), `cryptoAdjacent?` (optional) to `XstockSpotEntry` is ZERO-RISK to current consumers.** The only new reader is the A.2 scanner pre-cycle compute block, which reads `entry.sector` to thread into `updatePair()`.

TypeScript's structural typing enforces that every entry must have `sector` defined at compile time. Any incomplete entry causes a build failure at PR submission.

---

## §8 — Two-instance construction safety (test mocks)

### 8.1 `b63-item16-dbs-store.test.ts` import + usage surface

```ts
import {
  directionalBiasStore,                // ← singleton, used directly
  getLatestGlobalDbsSnapshot,           // ← convenience accessor
  GLOBAL_DBS_MIN_SAMPLE_COUNT,          // ← constant (deprecated for runtime per B72; tests still reference)
} from '../../core/metrics/directional-bias-store';
```

Test invocations all reference `directionalBiasStore.*`:

```ts
directionalBiasStore.clear();              // ~7 sites (beforeEach)
directionalBiasStore.updatePair(...);      // ~5 sites (population)
directionalBiasStore.publishSnapshot();    // ~7 sites
directionalBiasStore.getLatestSnapshot();  // ~5 sites
directionalBiasStore.getStoreSize();       // ~1 site
getLatestGlobalDbsSnapshot();              // ~1 site
```

### 8.2 Refactor safety

Constructor-arg refactor:

```ts
// BEFORE
export const directionalBiasStore = new DirectionalBiasStore();

// AFTER
export const directionalBiasStore = new DirectionalBiasStore({
  mode: 'crypto', assetClassForKnobs: 'crypto_spot'
});
export const xstockDirectionalBiasStore = new DirectionalBiasStore({
  mode: 'xstock', assetClassForKnobs: 'xstock_spot'
});
```

The singleton-export name `directionalBiasStore` is preserved. Test bindings (which import this name) work unchanged. The `clear()` method must reset both stores OR remain a per-instance method (A.2 design: keep per-instance; tests call `directionalBiasStore.clear()` for crypto, and new tests will call `xstockDirectionalBiasStore.clear()` for xStock).

### 8.3 D16 will add a new test file targeting the two-instance construction directly (+5 cases per scope rev2 §17):

- Constructor with `mode='crypto'` produces store with crypto semantics
- Constructor with `mode='xstock'` produces store with xStock semantics (sector partition + sector-coverage floor)
- `updatePair()` 4-arg variant (crypto) leaves `sector` undefined
- `updatePair()` 5-arg variant (xStock) records sector
- INDEX_PROXY / BROAD_ETF / INTL_ETF entries stored but excluded from xStock aggregation

### 8.4 Verdict

CLEAN — no test mock collisions. D16 unit tests preserve all existing b63-item16 assertions and add new two-instance + sector-filter assertions.

---

## §9 — System Manual consultation

### 9.1 Current DBS chapter inventory (`1-system-manual/SYSTEM_MANUAL.md`)

Lines 1290-1339 cover the B62 DBS-integrated classifier redesign. Chapter is comprehensive but crypto-implicit:

- Line 1295-1299: classifier redesign (RBS / TFS / IE DBS-gated)
- Line 1310-1325: Global DBS aggregation methodology + B62 fixes (volume weighting, coverage gate, sentinel filter)
- Line 1331-1339: Phase 15b B61 validation findings

### 9.2 No architectural contradictions with rev2 design

The byte-identical formula/thresholds/lookback/EMA invariant means the existing chapter applies as-is to the xStock per-pair compute. The xStock global aggregation differs (sector partition + sector-coverage floor + GICS-only counting) — this is a new addition, not a contradiction.

### 9.3 A.2 Step 10 governance addendum

Per scope rev2 §22, Step 10 adds a new System Manual subsection: **"Phase 14 — DBS extension to xStocks (B-PHASE-A2)"** documenting:

- Two-store pattern (`directionalBiasStore` + `xstockDirectionalBiasStore`, same class, different mode)
- Sector taxonomy on the registry (11 GICS + INDEX_PROXY + BROAD_ETF + INTL_ETF + ADR/cryptoAdjacent flags)
- Floor mechanics (global-30 GICS-only-non-sentinel + sector-coverage-7)
- INDEX_PROXY exclusion at aggregation
- Extended-hours expected-degraded behavior (4-sector coverage during ARCA-closed)
- B-PHASE-E-PRE-1 dependency for sector-correlation factor work (cross-referenced from MULTI_ASSET_VTS_EXPANSION_PLAN.md + XSTOCK_CALIBRATION_PLAN.md)

This is an extension, not a contradiction. CLEAN.

---

## §10 — Archive maturity gate (empirical)

Executed 2026-05-17 21:30 UTC against staging Supabase:

```sql
SET statement_timeout = 60000;
SELECT MIN(interval_begin) FROM xstock_spot_ohlc_1m
WHERE interval_begin > NOW() - INTERVAL '60 days';
```

Result:

```
          min
 2026-04-30 19:59:00+00
```

Last bar query:

```
        last_bar        |        now_minus_1min
 2026-05-15 23:59:00+00 | 2026-05-17 21:29:41.392822+00
```

- **First archived bar:** 2026-04-30 19:59 UTC
- **Last archived bar:** 2026-05-15 23:59 UTC (Friday close; weekend gap expected)
- **Archive depth:** ~17 days

**Verdict: PASS.** 17 days exceeds the v2 plan §A.2 14-day no-caveat threshold. A.2 ships without thinness caveat.

Note: scope rev2 quoted "~30 days"; actual is 17 days. Still clears all gates; no scope change.

---

## §11 — Scanner-headroom empirical measurement

### 11.1 Synthetic timing on representative 60-bar 60-min OHLC

Executes the full DBS pipeline per pair:

1. `computeATRFromOHLC(ohlc, 14)`
2. `computeDirectionalBias(ohlc, atr)` (slope + return + EMA components)
3. `computeATRFromOHLC(priorOHLC, 14)` on `ohlc.slice(0, -3)`
4. `computeDirectionalBias(priorOHLC, priorAtr)` (slope calc)

Measured with `process.hrtime.bigint()` across 200 iterations on representative price scale ($150) + realistic 1%/bar volatility.

### 11.2 Result

```
Total: 31.52ms across 200 pairs
Per-pair: 0.158ms
Worst-case 250 pairs: 39.40ms
% of 25000ms cycle budget: 0.16%
```

### 11.3 Verdict

**0.16% of 25s cycle budget. >430× under the 70% fallback trigger.** No fallback design needed per scope rev2 §3 #6 — primary design proceeds.

### 11.4 Step 7 verification deliverable

The synthetic measurement uses representative OHLC; real cost may vary by 2-3× due to JIT warmup, garbage-collection pauses, or larger arrays (some pairs >60 bars). Even at 10× synthetic = 1.6% of budget, vastly under threshold. Step 3 implementation adds per-cycle telemetry log `[B-PHASE-A2][CYCLE_DBS_TIMING] dbs_compute_ms=N pairs=M`; Step 7 first-pass verification reads this against the analytical estimate.

---

## §12 — Registry completeness pre-check

```
$ grep -c "^\s*\['" shared/asset-classes.ts
265
```

**Registry size: 265 entries.**

### 12.1 D17 spot-check name verification

All 15 high-profile-name asserts locked in scope rev2 D17 verified present in registry:

| D17 assert | Symbol | In registry? | Notes |
|---|---|---|---|
| AAPL/USD → XLK | `['AAPL/USD', { name: 'Apple', is24_7: true }]` | ✓ | also 24/7 |
| MSFT/USD → XLK | `['MSFT/USD', { name: 'Microsoft' }]` | ✓ | |
| NVDA/USD → XLK | `['NVDA/USD', { name: 'Nvidia', is24_7: true }]` | ✓ | also 24/7 |
| JPM/USD → XLF | `['JPM/USD', { name: 'JPMorgan Chase' }]` | ✓ | |
| BAC/USD → XLF | `['BAC/USD', { name: 'Bank of America' }]` | ✓ | |
| XOM/USD → XLE | `['XOM/USD', { name: 'ExxonMobil' }]` | ✓ | |
| CVX/USD → XLE | `['CVX/USD', { name: 'Chevron' }]` | ✓ | also Kraken collision (handled by B79.0f) |
| JNJ/USD → XLV | `['JNJ/USD', { name: 'Johnson & Johnson' }]` | ✓ | |
| ELV/USD → XLV | `['ELV/USD', { name: 'Elevance Health' }]` | ✓ | substituted for UNH (not in xStock registry) |
| PG/USD → XLP | `['PG/USD', { name: 'Procter & Gamble' }]` | ✓ | |
| KO/USD → XLP | `['KO/USD', { name: 'Coca-Cola' }]` | ✓ | |
| RTX/USD → XLI | `['RTX/USD', { name: 'RTX Corporation' }]` | ✓ | substituted for BA (not in xStock registry) |
| AMZN/USD → XLY | `['AMZN/USD', { name: 'Amazon' }]` | ✓ | |
| TSLA/USD → XLY | `['TSLA/USD', { name: 'Tesla', is24_7: true }]` | ✓ | also 24/7 |
| GOOGL/USD → XLC | `['GOOGL/USD', { name: 'Alphabet', is24_7: true }]` | ✓ | also 24/7 |

### 12.2 INDEX_PROXY + ETF bucket preview

- INDEX_PROXY (2): SPY/USD, QQQ/USD. IWM/USD NOT in registry.
- BROAD_ETF candidates: ARKK/USD, ARKG/USD, XBI/USD, GLD/USD, TOTL/USD, IEMG/USD (~6 entries).
- INTL_ETF candidates: EWA/USD, EWC/USD, EWG/USD, EWI/USD, EWL/USD, EWN/USD, EWP/USD, EWQ/USD, EWS/USD, EWU/USD, EWZ/USD (11 entries — fully populated).

### 12.3 Sector taxonomy concentration risk

Approximate per-sector entry-count estimates (based on registry scan):

- **XLK (Tech):** ~30 entries (largest bucket)
- **XLF (Financials):** ~25 entries
- **XLV (Healthcare):** ~25 entries
- **XLE + XLI + XLY:** ~15-20 each
- **XLP + XLU + XLB + XLRE:** ~10-15 each
- **XLC (Comm Services):** ~10 entries (smallest sector)
- **INDEX_PROXY:** 2
- **BROAD_ETF:** ~6
- **INTL_ETF:** 11
- **ADR flag:** ~25 names (BABA, BIDU, JD, NIO, LI, ASML, BNTX, SAP, SHEL, NVO, DEO, UL, TEVA, BUD, BTI, NTES, PDD, TAL, EDU, GOTU, TME, XPEV, BILI, BHC, BMBL)
- **cryptoAdjacent flag:** ~10 names (MSTR, COIN, CIFR, BITF, BTBT, HIVE, HUT, CLSK, GLXY, DFDV)

### 12.4 GICS reclassification gotchas (per Langston Step 1 #1 institutional knowledge)

D5 reference doc will explicitly flag:

- **GOOGL → XLC** (Communication Services, GICS reclassification 2018; historically remembered as XLK)
- **AMZN → XLY** (Consumer Discretionary; not XLP/XLK despite AWS revenue)
- **V/MA → XLF** (Financials, data-processors subsector; not XLK) — but V and MA are NOT in xStock registry today, so not currently a mapping concern
- **MSTR → XLK** with `cryptoAdjacent: true` flag (historically tech-software; increasingly behaves as crypto-proxy due to BTC treasury)

---

## §13 — Step 3 implementation plan

After Step 2 ACK from Langston, Step 3 sequencing:

| Sub-task | Files | Tests | Commit |
|---|---|---|---|
| A | `server/core/metrics/directional-bias-store.ts` — constructor option + sector field + xstock branch in `publishSnapshot` | `b-phase-a2-xstock-dbs-store.test.ts` (~5 cases) | "B-PHASE-A2 (A): two-instance DBS store w/ sector partition" |
| B | `shared/asset-classes.ts` — `XstockSector` type, registry shape, all 265 sector mappings + `xstock_sector_mappings_reference.md` companion doc (pause for Langston spot-check) | `b-phase-a2-xstock-eval-cycle-dbs.test.ts` (~4 cases — registry completeness + D17 spot-check asserts) | "B-PHASE-A2 (B): xStock sector taxonomy + 265-entry registry mapping" |
| C | `server/asset_classes/xstock_spot/scanner.ts` — pre-cycle DBS compute block + `dbsBySymbol` Map. `server/asset_classes/xstock_spot/eval-cycle.ts` — `evaluateXstockPairForVTS` gains `propagatedDbs?` param + threads to MCE. | scanner integration tests TBD | "B-PHASE-A2 (C): xStock scanner DBS compute + eval-cycle threading" |
| D | `drizzle/migrations/2026-05-XX-b-phase-a2-dbs-constants.sql` — 8 knobs × 1 xstock_spot row each, idempotent ON CONFLICT DO UPDATE | n/a | "B-PHASE-A2 (D): module_constants xStock DBS knobs migration" |
| E | NEW table `xstock_dbs_backfill` + `scripts/b-phase-a2-backfill.ts` | n/a | "B-PHASE-A2 (E): backfill table + script" |
| F | Run Vitest; CI green | full suite | "B-PHASE-A2 (F): finalize + test count verification" |

After F: dispatch Step 4 code review to Langston (embed-diff-inline per CLAUDE.md §6.5.0.a).

Cadence: ~6 commits, ~3-5 days nominal per scope §2 estimate.

---

## §14 — Open questions for Langston

None. All 12 pre-audit work items resolve CLEAN. The two material items (MCE branch trace + scanner headroom) confirmed positive with code-level evidence.

---

## §15 — Verdict + sign-off request

**Pre-audit verdict: CLEAN — no scope changes required.**

Request from Langston: Step 2 ACK (or revisions) to proceed to Step 3 implementation. On ACK, sub-task A starts immediately.

---

— Claude Code, 2026-05-17
